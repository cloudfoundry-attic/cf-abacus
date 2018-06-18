#!/usr/bin/env bash

SCRIPT_DIR="${BASH_SOURCE%/*}"
if [[ ! -d "$SCRIPT_DIR" ]]; then
  SCRIPT_DIR="$PWD";
fi

find $SCRIPT_DIR/.. -name node_modules -type d -exec rm -rf {} \;
