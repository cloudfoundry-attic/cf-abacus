#!/bin/sh

set -e -x

export PATH=$GOPATH/bin:$PATH

DEVELOP=$PWD/abacus-release-develop

git clone ./abacus-release-master ./release-merged

cd release-merged

git remote add local $DEVELOP

git fetch local
git checkout local/develop

git config --global user.email "ci@localhost"
git config --global user.name "CI Bot"

git merge --no-edit master
