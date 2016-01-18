#!/bin/sh

version=0.1
rm builds/zotero-zooper-${version}-fx.xpi
zip -r builds/zotero-zooper-${version}-fx.xpi chrome/* chrome.manifest install.rdf
