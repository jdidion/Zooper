if (typeof Zotero === 'undefined') {
    Zotero = {};
}
Zotero.Zooper = {
    storageDir: null,
    DB: null
};

Zotero.Zooper.init = function() {
    Zotero.Zooper.resetState();
    
    // set up parallel storage
    Zotero.Zooper.storageDir = Zotero.getStorageDirectory();
    Zotero.Zooper.storageDir.append("zooper");
    if (!Zotero.Zooper.storageDir.exists()) {
        Zotero.Zooper.storageDir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
    }
    
    // add database tables to manage item-PDF links
    // an attachment is an item with a sourceItemID
    // (the parent item) and a max of one note
    Zotero.Zooper.DB = new Zotero.DBConnection('zooper');
    if (!Zotero.Zooper.DB.tableExists('items')) {
        Zotero.Zooper.DB.query("
        CREATE TABLE items (
            itemID INTEGER PRIMARY KEY,
            itemTypeID INT NOT NULL,
            dateAdded TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            dateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            clientDateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            libraryID INT,
            key TEXT NOT NULL,
            UNIQUE (libraryID, key),
            FOREIGN KEY (libraryID) REFERENCES libraries(libraryID)
        )");
        Zotero.Zooper.DB.query("
        CREATE TABLE itemDataValues (
            valueID INTEGER PRIMARY KEY,
            value UNIQUE
        )");
        Zotero.Zooper.DB.query("
        CREATE TABLE itemData (
            itemID INT,
            fieldID INT,
            valueID,
            PRIMARY KEY (itemID, fieldID),
            FOREIGN KEY (itemID) REFERENCES items(itemID),
            FOREIGN KEY (fieldID) REFERENCES fields(fieldID),
            FOREIGN KEY (valueID) REFERENCES itemDataValues(valueID)
        )");
        Zotero.Zooper.DB.query("
        CREATE TABLE itemNotes (
            itemID INTEGER PRIMARY KEY,
            sourceItemID INT,
            note TEXT,
            title TEXT,
            FOREIGN KEY (itemID) REFERENCES items(itemID),
            FOREIGN KEY (sourceItemID) REFERENCES items(itemID)
        )");
        Zotero.Zooper.DB.query("
        CREATE TABLE itemAttachments (
            itemID INTEGER PRIMARY KEY,
            sourceItemID INT,
            mimeType TEXT,
            charsetID INT,
            path TEXT,
            originalPath TEXT,
            storageHash TEXT
        )");
    }
};

Zotero.Zooper.resetState = function() {
    Zotero.Zooper.current = -1;
    Zotero.Zooper.toResolve = 0;
    Zotero.Zooper.itemsToResolve= null;
    Zotero.Zooper.numberOfResolvedItems = 0;
};

Zotero.Zooper.handleSelectedEntities = function(operation) {
    if (!ZoteroPane.canEdit()) {
        ZoteroPane.displayCannotEditLibraryMessage();
        return;
    }
    
    var collection = ZoteroPane.getSelectedCollection();
    var group = ZoteroPane.getSelectedGroup();

    if (collection) {
        var items = [];
        collection.getChildren(true, false, 'item').forEach(function (item) {
            items.push(item);
        });
        operation(items);
    } else if (group) {
        if (!group.editable) {
            alert("This group is not editable!");
            return;
        }
        var items = [];
        group.getCollections().forEach(function(collection) {
            collection.getChildren(true, false, 'item').forEach(function(item) {
                items.push(item);
            });
        });
        operation(items);
    } else {
        Zotero.Zooper.handleAll(operation);
    }    
};

Zotero.Zooper.handleSelectedItems = function(operation) {
    operation(ZoteroPane.getSelectedItems());
};

Zotero.Zooper.handleAll = function(operation) {
    var items = [];
    Zotero.Items.getAll().forEach(function (item) {
        if (item.isRegularItem() && !item.isCollection()) {
            var libraryId = item.getField('libraryID');
            if (libraryId == null ||
                    libraryId == '' ||
                    Zotero.Libraries.isEditable(libraryId)) {
                items.push(item);
            }
        }
    });
    operation(items);
};

Zotero.Zooper.resolveItems = function(items, operation) {
    if (items.length == 0) {
        alert("No items to resolve");
        return;
    }
    else if (Zotero.Zooper.numberOfResolvedItems < Zotero.Zooper.toResolve) {
        alert("Hold your horses! I haven't finished resolving the last set of items.")
        return;
    }

    Zotero.Zooper.resetState();
    Zotero.Zooper.toResolve = items.length;
    Zotero.Zooper.itemsToResolve = items;
    Zotero.Zooper.resolveNextItem(operation);
};

Zotero.Zooper.resolveNextItem = function(operation) {
    Zotero.Zooper.numberOfResolvedItems++;

    if (Zotero.Zooper.current == Zotero.Zooper.toResolve - 1) {
        Zotero.Zooper.resetState();
        return;
    }

    Zotero.Zooper.current++;

    try {
        operation(Zotero.Zooper.itemsToResolve[Zotero.Zooper.current]);
    } catch (err) {
        alert(err);
    }
};

Zotero.Zooper.resolveDOI = function(item) {
    item = Zotero.Items.get(item.id);
    
    var doi = item.getField("DOI");
    
    if (doi) {
        var translate = Zotero.Translate.newInstance("search");
        translate.setTranslator("11645bd1-0420-45c1-badb-53fb41eeb753");
        translate.setSearch({"itemType":"journalArticle", "DOI":doi});
        
        translate.setHandler("itemDone", function(translate, newItem) {
            var srcItem = [];
            srcItem.push(item);
            Zotero.Items.merge(newItem, srcItem);
            Zotero.Zooper.resolveNextItem(Zotero.Zooper.resolveDOI);
        });
        
        translate.translate();
    } 
    else {
        alert("Item does not have DOI")
        Zotero.Zooper.resolveNextItem(Zotero.Zooper.resolveDOI);
    }
};
Zotero.Zooper.OP_DOI = function(items) {
    Zotero.Zooper.resolveItems(items, Zotero.Zooper.resolveDOI);
};

Zotero.Zooper.resolveURL = function(item) {
    var url = item.getField("url");
    var doi = item.getField("DOI");
    var title = item.getField("title");
    
    if (url && (doi || title)) {
        try {
        var browser = gBrowser.selectedBrowser;
        var notifierID;
        
        var notifierCallback = {
            notify: function(event, type, ids, extraData) {
                if (event == 'add') {
                    var items = Zotero.Items.get(ids);
                    for (i = 0; i < items.length; i++) {
                        if ((doi && doi == items[i].getField("DOI")) ||
                                 (title && title == items[i].getField("title"))) {
                            var srcItem = [];
                            srcItem.push(item);
                            Zotero.Items.merge(items[i], srcItem);
                        }
                    }
                }
                
                Zotero.Notifier.unregisterObserver(notifierID);
                Zotero.Zooper.resolveNextItem(Zotero.Zooper.resolveURL);
            }
        };
        
        var notifierID = Zotero.Notifier.registerObserver(notifierCallback, ['item']);
        
        var listener = function() {
            var updateCount = 0;
            var lastUpdateCount = 0;
            var intervalID = null;
            var done = false;
            
            var onInterval = function() {
                if (updateCount > lastUpdateCount) {
                    lastUpdateCount = updateCount;
                }
                else {
                    document.removeEventListener("load", onLoad);
                    window.clearInterval(intervalID);
                
                    if (!done) {
                        done = true;
                        Zotero_Browser.scrapeThisPage();
                    }
                }
            };
            
            var onLoad = function() {
                if (updateCount === 0) {
                    intervalID = window.setInterval(onInterval, 2000);    
                }
                updateCount++;
            }
            
            return onLoad;
        };
                
        document.addEventListener("load", listener(), true);
        
        openUILinkIn(url, "current");
        
        } catch(err) {
            alert(err);
        }
    }
    else {
        alert("Item does not have URL or matchable field");
        Zotero.Zooper.resolveNextItem(Zotero.Zooper.resolveURL);
    }
};
Zotero.Zooper.OP_URL = function(items) {
    Zotero.Zooper.resolveItems(items, Zotero.Zooper.resolveURL);
}

/*
 * System for unloading and reloading PDF files into Zotero database.
 * Adds two context menu items:
 * 1. Unload PDFs - move PDFs to parallel file system, delete the
 * item attachments, and record the link between item ID and PDF.
 * 2. Reload PDFs - import PDFs back into Zotero file system, and
 * remove them from the parallel file system.
 */
Zotero.Zooper.unloadPDFs = function(items) {
    if (!items.length) {
        alert("No items to unload");
        return;
    }
    
    for (i = 0; i < items.length; i++) {
        // keep items with one or more PDFs
        
        // begin transaction
        
        // copy PDF item data to DB
        
        // copy PDF files to parallel storage
        
        // remove attachment items
        
        // commit transaction
    }
};
Zotero.Zooper.OP_UNLOAD = function(items) {
    Zotero.Zooper.unloadPDFs(items);
};

Zotero.Zooper.reloadPDFs = function(items) {
    if (!items.length) {
        alert("No items to unload");
        return;
    }
    for (i = 0; i < items.length; i++) {
        // look up item DB
        
        if (items[i]) {
            // create attachment items
            
            // delete PDFs from parallel file system
            
            // delete attachment items DB
            
        }
        else {
            alert("Item does not have previously associated PDF");
        }
    }
};
Zotero.Zooper.OP_RELOAD = function(items) {
    Zotero.Zooper.reloadPDFs(items);
};

module.exports = Zotero.Zooper;