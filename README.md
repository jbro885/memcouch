# memcouch

Assuming a CouchDB dataset small enough to replicate to the client, why not simply keep it in memory?

Access the data with synchronous calls (including a simple "full table scan" style query mechanism) while keeping basic track of changes. Then let some other code handle the "eventual consistency" part in the background — asynchronously replicating\* to something like [PouchDB](http://pouchdb.com) or [CouchDB](http://couchdb.apache.org) in the background.


## Example usage




## API Documentation

Memcouch provides a sychronous API to an in-memory collection of documents. The basic API is as follows:

* `let db = memcouch.db()` — returns a new in-memory document collection
* `db.put(doc)` — saves new document or increments revision, if no _id one will be generated
* `db.get(id)` — returns document with given _id, or `undefined` if missing. This object may be shared with other callers.
* `db.del(id)` — removes all non-internal fields and adds `"_deleted": true`. will no longer show up from `.get` or `.query`


// EXPECTATIONS:
// local edits will maintain _rev of its source
// saved edits will expectUpdate(id, _rev) from response
// [if unexpected change to id happens, warn but de-conflict?]
//   stored= _rev of update doc matches [expected] _rev of edited
// conflict= _rev of edited doc does not match _rev of source doc
// if no _rev, assume no conflict (i.e. last-save-wins update…)
