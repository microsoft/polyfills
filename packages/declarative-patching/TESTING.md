# Testing the polyfill

## Overview

The project uses [Playwright](https://playwright.dev) for testing.

* `src/**/*.spec.js` are unit tests for utilities
* `tests/**` are integration tests

## Prerequisites

1. Install the repo if you haven't:

    ```sh
    npm ci
    ```

2. Install browser binaries needed for Playwright tests:

    ```sh
    npx playwright install
    ```


## Running the tests

This will run Playwright tests.

```sh
npm test
```

If you'd like to run with UI mode:

```sh
npm test -- --ui
```
