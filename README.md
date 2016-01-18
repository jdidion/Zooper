# Zooper

Zooper is a Zotero plugin that with a few functions for resolving missing metadata and managing attachments:

1. Update metadata from DOI: If an article has a DOI, metadata is fetched from CrossRef. Currently, this works by creating a new item, merging it with the existing item, and then erasing it.
2. Update metadata and fetch attachments from Web: If an article has a URL, scrape metadata and attachments. Currently, this opens the URL in the current tab, executes the web scraper, listens for the creation of a new item, merges that item with the existing one, and then erases it.
3. Unload and reload attachments: To deal with the situation where you run out of cloud storage space:
    * Unload moves attachments for selected items to a parallel file storage and records their association with items in a custom database table.
    * Reload re-attaches previously unloaded attachments to the appropriate items.

# Warning

When metadata is updated from a DOI or URL, the new item is kept and the existing item is moved to the trash (after copying over all attachments, relations, etc).

# Known Issues

1. DOI/URL menu items do not check that DOI/URL is available before displaying.