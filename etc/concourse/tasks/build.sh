#!/bin/bash

set -e

export NPM_CONFIG_LOGLEVEL=warn

pushd cf-abacus-broker
  git submodule init
  git submodule update
  cd abacus
  yarn run provision
  cd ..
  yarn run build
popd
