#!/usr/bin/env bash
set -euo pipefail

readonly ARG_JOB="${1:-}"
readonly ARG_STEP="${2:-}"
readonly GIT_REPOSITORY_DIR="${GIT_REPOSITORY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
readonly APP_NAME="prettier-plugin-nix"

function help() {
    echo "USAGE: ${0} <job__wasm | job__build> [step__xxx]"
}

function job__wasm() {
    function step__build() {
        local package_dir="${GIT_REPOSITORY_DIR}/source/prettier-plugin-nix"
        local root="${GIT_REPOSITORY_DIR}/out/wasm"
        rm -rf "${package_dir}/wasm/pkg" "${root}"
        mkdir -p "${root}"
        tar -xzf "${GIT_REPOSITORY_DIR}/vendor/alejandra.tar.gz" -C "${root}" --strip-components 1
        wasm-pack build "${root}/src/alejandra_wasm" --target nodejs --out-dir "${package_dir}/wasm/pkg" --release
        rm -f "${package_dir}/wasm/pkg/.gitignore"
        rm -rf "${root}"
    }

    function all() {
        step__build
    }

    case "${ARG_STEP}" in
    step__build) step__build ;;
    *) all ;;
    esac
}

function job__build() {
    function step__wasm() {
        bash "${GIT_REPOSITORY_DIR}/script/prettier-plugin-nix.sh" job__wasm step__build
    }

    function step__build() {
        cd "${GIT_REPOSITORY_DIR}/source/prettier-plugin-nix"
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
        step__wasm
        step__build
        step__release
        step__stage
    }

    case "${ARG_STEP}" in
    step__wasm) step__wasm ;;
    step__build) step__build ;;
    step__release) step__release ;;
    step__stage) step__stage ;;
    *) all ;;
    esac
}

case "${ARG_JOB}" in
job__wasm) job__wasm ;;
job__build) job__build ;;
*) help ;;
esac
