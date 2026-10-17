#!/usr/bin/env bash
set -euo pipefail

readonly ARG_JOB="${1:-}"
readonly ARG_STEP="${2:-}"
readonly GIT_REPOSITORY_DIR="${GIT_REPOSITORY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

function help() {
    echo "USAGE: ${0} <job__build> [step__xxx]"
}

function job__build() {
    function step__build() {
        cd "${GIT_REPOSITORY_DIR}/source/prettier-plugin-biome"
        bun install
        bun run build
    }

    function step__release() {
        local root="${GIT_REPOSITORY_DIR}/out/build"
        cd "${GIT_REPOSITORY_DIR}/source/prettier-plugin-biome"
        rm -rf "${root}"
        mkdir -p "${root}"
        bun pm pack --destination "${root}"
        cp "${root}"/prettier-plugin-biome-*.tgz "${root}/prettier-plugin-biome.tgz"
        cd "${GIT_REPOSITORY_DIR}"
        if ! gh release view latest > /dev/null 2>&1; then
            gh release create latest --title "latest" --notes "1" --target "$(git rev-parse HEAD)"
        fi
        gh release upload latest --clobber "${root}"/*.tgz
        rm -rf "${root}"
    }

    function all() {
        step__build
        step__release
    }

    case "${ARG_STEP}" in
    step__build) step__build ;;
    step__release) step__release ;;
    *) all ;;
    esac
}

case "${ARG_JOB}" in
job__build) job__build ;;
*) help ;;
esac
