# copylink
Firefox / Chrome extension that allows quick copying of links.

Normally, if you want to copy a link you just right click on the link and then
select `Copy Link` from the context menu.  That's easy enough, just two clicks,
so why obther with this extension?

The problem is that the context menu is rather long, and you have to scan down
the list until you find `Copy Link`.  To make matters worse, the context menu
is dynamic so the ordering depends on what is being shown on the page and other
extensions running on the browser.

When you are working in a state of "flow", the act of scanning the
context menut to finding `Copy Link` takes mental effort and that breaks your
state of flow.

By replace this mentally taxing way of copying links with one that is based on
physical action (`Ctrl+C` or `shift click`) that can be offloaded to your muscle
memory, you can stay in your flow state and continue doing whatever you are
working on without losing concentration.

Overview
========

* Move the cursor over a link and use `Ctrl+C` to copy it to the
  clipboard (but if there is already a selection then Ctrl+C will copy the
  selection rather than the link.)

* Alternatively, hold the `shift key` and then use `middle mouse
  click` on the link to copy it (this works regardless of whether or not
  there is a selection.)

* To copy multiple links, hold the `shift key` and then use `left mouse click`
  on the link to add it to the links already copied to the clipboard.

* Alternatively, select the links, then click on the `click copy link toolbar
  icon` to copy them all into the clipboard.

* Last but not least, turn on the `Auto hover copy` option so that when the
  cursor hover over a link longer the `Auto hover delay` then it will be copied
  automatically to the clipboard.
