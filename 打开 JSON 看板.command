#!/bin/zsh

SCRIPT_DIR="${0:A:h}"
PAGE_URL="file://${SCRIPT_DIR}/index.html?standalone=1"

if [[ -d "/Applications/Google Chrome.app" ]]; then
  open -na "Google Chrome" --args --app="$PAGE_URL" --start-maximized
elif [[ -d "/Applications/Microsoft Edge.app" ]]; then
  open -na "Microsoft Edge" --args --app="$PAGE_URL" --start-maximized
else
  open "$PAGE_URL"
fi
