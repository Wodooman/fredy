/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { NoNewListingsWarning } from './errors.js';
import {
  storeListings,
  getKnownListingHashesForJobAndProvider,
  deleteListingsById,
} from './services/storage/listingsStorage.js';
import { getJob } from './services/storage/jobStorage.js';
import * as notify from './notification/notify.js';
import Extractor from './services/extractor/extractor.js';
import urlModifier from './services/queryStringMutator.js';
import logger from './services/logger.js';
import { geocodeAddress } from './services/geocoding/geoCodingService.js';
import { distanceMeters } from './services/listings/distanceCalculator.js';
import { getUserSettings } from './services/storage/settingsStorage.js';
import { updateListingDistance } from './services/storage/listingsStorage.js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

/**
 * @typedef {Object} Listing
 * @property {string} id Stable unique identifier (hash) of the listing.
 * @property {string} title Title or headline of the listing.
 * @property {string} [address] Optional address/location text.
 * @property {string} [price] Optional price text/value.
 * @property {string} [url] Link to the listing detail page.
 * @property {any} [meta] Provider-specific additional metadata.
 */

/**
 * @typedef {Object} SimilarityCache
 * @property {(title:string, address?:string)=>boolean} hasSimilarEntries Returns true if a similar entry is known.
 * @property {(title:string, address?:string)=>void} addCacheEntry Adds a new entry to the similarity cache.
 */

/**
 * Runtime orchestrator for fetching, normalizing, filtering, deduplicating, storing,
 * and notifying about new listings from a configured provider.
 *
 * The execution flow is:
 * 1) Prepare provider URL (sorting, etc.)
 * 2) Extract raw listings from the provider
 * 3) Normalize listings to the provider schema
 * 4) Filter out incomplete/blacklisted listings
 * 5) Identify new listings (vs. previously stored hashes)
 * 6) Persist new listings
 * 7) Filter out entries similar to already seen ones
 * 8) Dispatch notifications
 */
class FredyPipelineExecutioner {
  /**
   * Create a new runtime instance for a single provider/job execution.
   *
   * @param {Object} providerConfig Provider configuration.
   * @param {string} providerConfig.url Base URL to crawl.
   * @param {string} [providerConfig.sortByDateParam] Query parameter used to enforce sorting by date (provider-specific).
   * @param {string} [providerConfig.waitForSelector] CSS selector to wait for before parsing content.
   * @param {Object.<string, string>} providerConfig.crawlFields Mapping of field names to selectors/paths to extract.
   * @param {string} providerConfig.crawlContainer CSS selector for the container holding listing items.
   * @param {(raw:any)=>Listing} providerConfig.normalize Function to convert raw scraped data into a Listing shape.
   * @param {(listing:Listing)=>boolean} providerConfig.filter Function to filter out unwanted listings.
   * @param {(url:string, waitForSelector?:string)=>Promise<void>|Promise<Listing[]>} [providerConfig.getListings] Optional override to fetch listings.
   * @param {Object} notificationConfig Notification configuration passed to notification adapters.
   * @param {Object} spatialFilter Optional spatial filter configuration.
   * @param {string} providerId The ID of the provider currently in use.
   * @param {string} jobKey Key of the job that is currently running (from within the config).
   * @param {SimilarityCache} similarityCache Cache instance for checking similar entries.
   * @param browser
   * @param {import('./services/jobs/executionTracer.js').default} [tracer] Optional execution tracer for health tracking.
   */
  constructor(providerConfig, notificationConfig, spatialFilter, providerId, jobKey, similarityCache, browser, tracer) {
    this._providerConfig = providerConfig;
    this._notificationConfig = notificationConfig;
    this._spatialFilter = spatialFilter;
    this._providerId = providerId;
    this._jobKey = jobKey;
    this._similarityCache = similarityCache;
    this._browser = browser;
    this._tracer = tracer || null;
  }

  /**
   * Execute the end-to-end pipeline for a single provider run.
   *
   * @returns {Promise<Listing[]|void>} Resolves to the list of new (and similarity-filtered) listings
   * after notifications have been sent; resolves to void when there are no new listings.
   */
  async execute() {
    try {
      // 1. URL Preparation
      const url = await this._traced('url_preparation', async () => {
        const result = urlModifier(this._providerConfig.url, this._providerConfig.sortByDateParam);
        return { result, message: 'URL prepared', details: { url: result } };
      });

      // 2. Extraction
      const rawListings = await this._traced('extraction', async () => {
        const getter = this._providerConfig.getListings?.bind(this) ?? this._getListings.bind(this);
        const listings = await getter(url);
        const count = listings?.length || 0;
        if (this._tracer) this._tracer.setListingsFound(count);
        return { result: listings, message: `Extracted ${count} raw listings`, details: { count } };
      });

      // 3. Normalization
      const normalized = await this._traced('normalization', async () => {
        const result = this._normalize(rawListings);
        return { result, message: `Normalized ${result.length} listings`, details: { count: result.length } };
      });

      // 4. Filtering
      const filtered = await this._traced('filtering', async () => {
        const result = this._filter(normalized);
        const blacklisted = normalized.length - result.length;
        return {
          result,
          message: `${normalized.length} → ${result.length} (${blacklisted} filtered)`,
          details: { before: normalized.length, after: result.length, filtered: blacklisted },
        };
      });

      // 5. Deduplication
      const newListings = await this._traced('deduplication', async () => {
        const result = this._findNew(filtered);
        if (this._tracer) this._tracer.setNewListings(result.length);
        return {
          result,
          message: `${result.length} new of ${filtered.length} total`,
          details: { total: filtered.length, new: result.length, known: filtered.length - result.length },
        };
      });

      // 6. Geocoding
      const geocoded = await this._traced('geocoding', async () => {
        const result = await this._geocode(newListings);
        const geocodedCount = result.filter((l) => l.latitude != null).length;
        return {
          result,
          message: `${geocodedCount} geocoded, ${result.length - geocodedCount} without coordinates`,
          details: { geocoded: geocodedCount, failed: result.length - geocodedCount },
        };
      });

      // 7. Storage
      const stored = await this._traced('storage', async () => {
        this._save(geocoded);
        return { result: geocoded, message: `Stored ${geocoded.length} listings`, details: { count: geocoded.length } };
      });

      // 8. Distance Calculation
      const withDistance = await this._traced('distance', async () => {
        const result = this._calculateDistance(stored);
        const calculated = result.filter((l) => l.distance_to_destination != null).length;
        return {
          result,
          message: `${calculated} calculated, ${result.length - calculated} skipped`,
          details: { calculated, skipped: result.length - calculated },
        };
      });

      // 9. Similarity Filter
      const unique = await this._traced('similarity', async () => {
        const result = this._filterBySimilarListings(withDistance);
        const filtered = withDistance.length - result.length;
        return {
          result,
          message: `${filtered} filtered, ${result.length} kept`,
          details: { filtered, kept: result.length },
        };
      });

      // 10. Area Filter
      const inArea = await this._traced('area_filter', async () => {
        const polygonFeatures = this._spatialFilter?.features?.filter((f) => f.geometry?.type === 'Polygon');
        if (!polygonFeatures?.length) {
          return { result: unique, message: 'No spatial filter configured', details: null, status: 'skipped' };
        }
        const result = this._filterByArea(unique);
        const filtered = unique.length - result.length;
        return {
          result,
          message: `${filtered} filtered, ${result.length} kept`,
          details: { filtered, kept: result.length },
        };
      });

      // 11. Notification
      await this._traced('notification', async () => {
        if (inArea.length === 0) {
          return { result: inArea, message: 'No listings to notify about', details: null, status: 'skipped' };
        }
        const sendNotifications = notify.send(this._providerId, inArea, this._notificationConfig, this._jobKey);
        await Promise.all(sendNotifications);
        const adapterCount = sendNotifications.length;
        return {
          result: inArea,
          message: `Notified ${adapterCount} adapters about ${inArea.length} listings`,
          details: { adapters: adapterCount, listings: inArea.length },
        };
      });

      return inArea;
    } catch (err) {
      this._handleError(err);
    }
  }

  /**
   * Run a pipeline stage with optional tracing.
   * The callback must return { result, message, details, status? }.
   * Returns the result value.
   *
   * @private
   */
  async _traced(stage, fn) {
    if (!this._tracer) {
      const { result } = await fn();
      return result;
    }

    const end = this._tracer.start(stage);
    try {
      const { result, message, details, status } = await fn();
      end(status || 'success', message, details);
      return result;
    } catch (err) {
      if (err.name === 'NoNewListingsWarning') {
        // NoNewListingsWarning is a normal outcome — record as success with 0 new
        if (stage === 'deduplication') {
          this._tracer.setNewListings(0);
        }
        end('success', 'No new listings found', null);
      } else {
        end('failure', err.message, { error: err.message, stack: err.stack });
      }
      throw err;
    }
  }

  /**
   * Geocode new listings.
   *
   * @param {Listing[]} newListings New listings to geocode.
   * @returns {Promise<Listing[]>} Resolves with the listings (potentially with added coordinates).
   */
  async _geocode(newListings) {
    for (const listing of newListings) {
      if (listing.address) {
        const coords = await geocodeAddress(listing.address);
        if (coords) {
          listing.latitude = coords.lat;
          listing.longitude = coords.lng;
        }
      }
    }
    return newListings;
  }

  /**
   * Filter listings by area using the provider's area filter if available.
   * Only filters if areaFilter is set on the provider AND the listing has coordinates.
   *
   * @param {Listing[]} newListings New listings to filter by area.
   * @returns {Listing[]} Listings that are within the area.
   */
  _filterByArea(newListings) {
    const polygonFeatures = this._spatialFilter?.features?.filter((f) => f.geometry?.type === 'Polygon');

    // If no area filter is set, return all listings
    if (!polygonFeatures?.length) {
      return newListings;
    }

    const filteredIds = [];
    // Filter listings by area - keep only those within the polygon
    const keptListings = newListings.filter((listing) => {
      // If listing doesn't have coordinates, keep it (don't filter out)
      if (listing.latitude == null || listing.longitude == null) {
        return true;
      }

      // Check if the point is inside the polygons
      const point = [listing.longitude, listing.latitude]; // GeoJSON format: [lon, lat]
      const isInPolygon = polygonFeatures.some((feature) => booleanPointInPolygon(point, feature));

      if (!isInPolygon) {
        filteredIds.push(listing.id);
      }

      return isInPolygon;
    });

    if (filteredIds.length > 0) {
      deleteListingsById(filteredIds);
    }

    return keptListings;
  }

  /**
   * Fetch listings from the provider, using the default Extractor flow unless
   * a provider-specific getListings override is supplied.
   *
   * @param {string} url The provider URL to fetch from.
   * @returns {Promise<Listing[]>} Resolves with an array of listings (empty when none found).
   */
  _getListings(url) {
    const extractor = new Extractor({ ...this._providerConfig.puppeteerOptions, browser: this._browser });
    return new Promise((resolve, reject) => {
      extractor
        .execute(url, this._providerConfig.waitForSelector)
        .then(() => {
          const listings = extractor.parseResponseText(
            this._providerConfig.crawlContainer,
            this._providerConfig.crawlFields,
            url,
          );
          resolve(listings == null ? [] : listings);
        })
        .catch((err) => {
          reject(err);
          logger.error(err);
        });
    });
  }

  /**
   * Normalize raw listings into the provider-specific Listing shape.
   *
   * @param {any[]} listings Raw listing entries from the extractor or override.
   * @returns {Listing[]} Normalized listings.
   */
  _normalize(listings) {
    return listings.map(this._providerConfig.normalize);
  }

  /**
   * Filter out listings that are missing required fields and those rejected by the
   * provider's blacklist/filter function.
   *
   * @param {Listing[]} listings Listings to filter.
   * @returns {Listing[]} Filtered listings that pass validation and provider filter.
   */
  _filter(listings) {
    const keys = Object.keys(this._providerConfig.crawlFields);
    const filteredListings = listings.filter((item) => keys.every((key) => key in item));
    return filteredListings.filter(this._providerConfig.filter);
  }

  /**
   * Determine which listings are new by comparing their IDs against stored hashes.
   *
   * @param {Listing[]} listings Listings to evaluate for novelty.
   * @returns {Listing[]} New listings not seen before.
   * @throws {NoNewListingsWarning} When no new listings are found.
   */
  _findNew(listings) {
    logger.debug(`Checking ${listings.length} listings for new entries (Provider: '${this._providerId}')`);
    const hashes = getKnownListingHashesForJobAndProvider(this._jobKey, this._providerId) || [];

    const newListings = listings.filter((o) => !hashes.includes(o.id));
    if (newListings.length === 0) {
      throw new NoNewListingsWarning();
    }
    return newListings;
  }

  /**
   * Persist new listings and pass them through.
   *
   * @param {Listing[]} newListings Listings to store.
   * @returns {void}
   */
  _save(newListings) {
    logger.debug(`Storing ${newListings.length} new listings (Provider: '${this._providerId}')`);
    storeListings(this._jobKey, this._providerId, newListings);
  }

  /**
   * Calculate distance for new listings.
   *
   * @param {Listing[]} listings
   * @returns {Listing[]}
   * @private
   */
  _calculateDistance(listings) {
    if (listings.length === 0) return [];

    const job = getJob(this._jobKey);
    const userId = job?.userId;

    if (userId == null || typeof userId !== 'string') {
      logger.debug('Skipping distance calculation: userId is missing or invalid');
      return listings;
    }

    const userSettings = getUserSettings(userId);
    const homeAddress = userSettings?.home_address;

    if (!homeAddress || !homeAddress.coords) {
      return listings;
    }

    const { lat, lng } = homeAddress.coords;
    for (const listing of listings) {
      if (listing.latitude != null && listing.longitude != null) {
        const dist = distanceMeters(lat, lng, listing.latitude, listing.longitude);
        updateListingDistance(listing.id, dist);
        listing.distance_to_destination = dist;
      }
    }
    return listings;
  }

  /**
   * Remove listings that are similar to already known entries according to the similarity cache.
   * Adds the remaining listings to the cache.
   *
   * @param {Listing[]} listings Listings to filter by similarity.
   * @returns {Listing[]} Listings considered unique enough to keep.
   */
  _filterBySimilarListings(listings) {
    const filteredIds = [];
    const keptListings = listings.filter((listing) => {
      const similar = this._similarityCache.checkAndAddEntry({
        title: listing.title,
        address: listing.address,
        price: listing.price,
      });
      if (similar) {
        logger.debug(
          `Filtering similar entry for title '${listing.title}' and address '${listing.address}' (Provider: '${this._providerId}')`,
        );
        filteredIds.push(listing.id);
      }
      return !similar;
    });

    if (filteredIds.length > 0) {
      deleteListingsById(filteredIds);
    }

    return keptListings;
  }

  /**
   * Handle errors occurring in the pipeline, logging levels depending on type.
   *
   * @param {Error} err Error instance thrown by previous steps.
   * @returns {void}
   */
  _handleError(err) {
    if (err.name === 'NoNewListingsWarning') {
      logger.debug(`No new listings found (Provider: '${this._providerId}').`);
    } else {
      logger.error(err);
    }
  }
}

export default FredyPipelineExecutioner;
