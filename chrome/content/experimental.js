/* This is an experimental version that opens pages
 * in hidden browser instances.
 */
Zotero.Zooper.resolveURL2 = function(item) {
    var url = item.getField("url");

    if (url) {
        var browser = Zotero.Browser.createHiddenBrowser();

        notifierCallback = {
            notify: function(event, type, ids, extraData) {
                var resolved = false;
                
                if (event == 'add') {
                    var items = Zotero.Items.get(ids);
                    for (i = 0; i < items.length; i++) {
                        if ((doi && doi === items[i].getField("DOI")) ||
                                (url === items[i].getField("url")) {
                            resolved = true;
                            var newItems = [];
                            newItems.push(items[i]);
                            Zotero.Items.merge(item, newItems);
                            Zotero.Items.erase(newItems);
                            break;
                        }
                    }
                }
                
                if (resolved) {
                    Zotero.Notifier.unregisterObserver(notifierID);
                    Zotero.Browser.deleteHiddenBrowser(browser);
                    Zotero.Zooper.resolveNextItem(Zotero.Zooper.resolveURL);
                }
            }
        };
        
        var notifierID = Zotero.Notifier.registerObserver(notifierCallback, ['item']);
        
        var onpageshow = function() {
            var tab = Zotero_Browser._getTabObject(browser);
            var page = tab.getPageObject();
            if (page.translators && page.translators.length) {
            	page.translate.setTranslator(translator || page.translators[0]);
                Zotero_Browser.performTranslation(page.translate);
            }
        };
        browser.addEventListener("pageshow", onpageshow, false);

        browser.loadURI(url);
    } 
    else {
        alert("Item does not have URL")
        Zotero.Zooper.resolveNextItem(Zotero.Zooper.resolveURL2);
    }
}