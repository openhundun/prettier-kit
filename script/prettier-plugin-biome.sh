#!/usr/bin/env bash
set -euo pipefail

readonly ARG_JOB="${1:-}"
readonly ARG_STEP="${2:-}"
readonly GIT_REPOSITORY_DIR="${GIT_REPOSITORY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
readonly APP_NAME="prettier-plugin-biome"

function help() {
    echo "USAGE: ${0} <job__build> [step__xxx]"
}

function job__build() {
    function step__build() {
        cd "${GIT_REPOSITORY_DIR}/source/prettier-plugin-biome"
        npm install --no-save --no-package-lock
        npm run build
    }

    function step__release() {
        cd "${GIT_REPOSITORY_DIR}/source/${APP_NAME}"
        local version="$(npm pkg get version | tr -d '"')"
        npm pack
        if ! gh release view "latest" > /dev/null 2>&1; then
            gh release create "latest" --title "latest" --notes "1" --target "$(git rev-parse HEAD)"
        fi
        gh release upload latest --clobber "${APP_NAME}-${version}.tgz"
    }

    function step__stage() {
        cd "${GIT_REPOSITORY_DIR}/source/${APP_NAME}"
        local version="$(npm pkg get version | tr -d '"')"
        local rev="${version%.*}.$(date -u +%Y%m%d%H%M%S)"
        npm pkg set version="${rev}"
        npm pack
        npm pkg set version="${version}"
        npm stage publish "${APP_NAME}-${rev}.tgz"
    }

    function all() {
        step__build
        step__release
        step__stage
    }

    case "${ARG_STEP}" in
    step__build) step__build ;;
    step__release) step__release ;;
    step__stage) step__stage ;;
    *) all ;;
    esac
}

case "${ARG_JOB}" in
job__build) job__build ;;
*) help ;;
esac
