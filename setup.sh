#!/bin/bash

[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if ! command -v nvm >&2; then
    echo "error: please install nvm first"
    exit 1
fi

echo "info: nvm is installed proceeding to the next step"

echo "info: setting up racero-l10n"
cd racero-l10n

nvm use
npm install
npm run build

echo "info: setting up racero-audio"
cd ../racero-audio

nvm use
npm install
npm run build

echo "info: setting up racero-blocks"
cd ../racero-blocks

nvm use
npm install

echo "info: setting up racero-vm"
cd ../racero-vm

nvm use
npm install
npm run build

echo "info: setting up racero-gui"
cd ../racero-gui

nvm use
npm install
npm run tauri dev
