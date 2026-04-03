# Delta Spec: Offline Provider Testing

## ADDED Requirements

### REQ-TEST-001: Fixture Download Script
The system SHALL provide a script (`scripts/download-fixture.js`) that accepts a provider ID as argument, launches Puppeteer, navigates to the provider's configured URL, and saves the fully-rendered HTML to `test/fixtures/<providerId>.html`.

#### Scenario: Download sparkasse fixture
- GIVEN the script is invoked with `node scripts/download-fixture.js sparkasse`
- WHEN Puppeteer loads the sparkasse URL from testProvider.json
- THEN the rendered HTML is saved to `test/fixtures/sparkasse.html`
- AND the script exits with code 0

#### Scenario: Download with custom URL
- GIVEN the script is invoked with `node scripts/download-fixture.js sparkasse --url "https://example.com"`
- WHEN Puppeteer loads the custom URL
- THEN the rendered HTML is saved to `test/fixtures/sparkasse.html`

#### Scenario: Invalid provider ID
- GIVEN the script is invoked with an unknown provider ID
- WHEN the provider is not found in testProvider.json
- THEN the script SHALL print an error and exit with code 1

### REQ-TEST-002: Fixture Parser Helper
The system SHALL provide a test helper (`test/helpers/fixtureParser.js`) that:
- Loads HTML from a fixture file
- Runs `parse(crawlContainer, crawlFields, html, url)` from the parser module
- Applies the provider's `normalize` function to each raw result
- Applies the provider's `filter` function
- Returns an object `{ raw, normalized, filtered }` with results from each stage

#### Scenario: Parse fixture with valid selectors
- GIVEN a fixture file exists with matching HTML structure
- WHEN `parseFixture(providerConfig)` is called
- THEN `raw` SHALL be a non-empty array of objects with fields from crawlFields
- AND `normalized` SHALL contain the same items with transformed fields
- AND `filtered` SHALL contain only items passing the blacklist filter

#### Scenario: Parse fixture with broken selectors
- GIVEN a fixture file exists but selectors don't match the HTML
- WHEN `parseFixture(providerConfig)` is called
- THEN `raw` SHALL be `null`

### REQ-TEST-003: Offline Provider Tests
The system SHALL support offline test files in `test/provider-offline/` that use the fixture parser helper to validate provider selectors against saved HTML, without network calls.

#### Scenario: Offline test validates listing structure
- GIVEN a fixture HTML file for a provider
- WHEN the offline test runs
- THEN it SHALL verify that parsed listings have non-null id, title, price, and link fields
- AND it SHALL verify normalize produces valid output
- AND it SHALL complete in under 1 second
