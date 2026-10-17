#!/usr/bin/env bash
set -euo pipefail

readonly ARG_JOB="${1:-}"
readonly ARG_STEP="${2:-}"
readonly GIT_REPOSITORY_DIR="${GIT_REPOSITORY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
readonly ALEJANDRA_DIR="${ALEJANDRA_DIR:-$(cd "${GIT_REPOSITORY_DIR}/../.." && pwd)/alejandra}"

function help() {
    echo "USAGE: ${0} <job__wasm | job__build> [step__xxx]"
}

function job__wasm() {
    function step__build() {
        local package_dir="${GIT_REPOSITORY_DIR}/source/prettier-plugin-nix"
        rm -rf "${package_dir}/wasm/pkg"
        wasm-pack build "${ALEJANDRA_DIR}/src/alejandra_wasm" --target nodejs --out-dir "${package_dir}/wasm/pkg" --release
        rm -f "${package_dir}/wasm/pkg/.gitignore"
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
        bun install
        bun run build
    }

    function step__release() {
        local root="${GIT_REPOSITORY_DIR}/out/build"
        cd "${GIT_REPOSITORY_DIR}/source/prettier-plugin-nix"
        rm -rf "${root}"
        mkdir -p "${root}"
        bun pm pack --destination "${root}"
        cp "${root}"/prettier-plugin-nix-*.tgz "${root}/prettier-plugin-nix.tgz"
        cd "${GIT_REPOSITORY_DIR}"
        if ! gh release view latest > /dev/null 2>&1; then
            gh release create latest --title "latest" --notes "1" --target "$(git rev-parse HEAD)"
        fi
        gh release upload latest --clobber "${root}"/*.tgz
        rm -rf "${root}"
    }

    function all() {
        step__wasm
        step__build
        step__release
    }

    case "${ARG_STEP}" in
    step__wasm) step__wasm ;;
    step__build) step__build ;;
    step__release) step__release ;;
    *) all ;;
    esac
}

case "${ARG_JOB}" in
job__wasm) job__wasm ;;
job__build) job__build ;;
*) help ;;
esac
