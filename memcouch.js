var memcouch = {};

memcouch.cmp = function (a,b) {
    // TOOD: full JSON comparisons similar to CouchDB
    return (a < b) ? -1 : (a > b) ? 1 : 0;
};

memcouch.db = function () {
    var db = {},
        docs = [],
        byId = Object.create(null);
    
    db.update_seq = 0;
    
    db.put = function (doc) {
        doc._id || (doc._id = Math.random().toFixed(20).slice(2));
        doc._seq = ++db.update_seq;         // NOTE: this is different than _rev (we leave that field alone)
        if (doc._deleted) delete byId[doc._id];
        else if (doc._id in byId) ;         // TODO: this won't update if doc is coming from elsewhere
        else docs.push(byId[doc._id] = doc);
        notify(doc);
    };
    
    db.get = function (id) {
        return byId[id];
    };
    
    db.del = function (id) {
        var doc = db.get(id);
        Object.keys(doc).forEach(function (k) {
            delete doc[k];
        });
        doc._id = id;
        doc._deleted = true;
        db.put(doc);
    };
    
    db.all = function () {
        return db.query(function (doc) {
            this.emit(doc._id, doc);
        });
    };
    
    db.query = function (map, cmp) {
        map || (map = function (d) { return d._id; });
        if (cmp === true) cmp = memcouch.cmp;
        
        var results = [],
            _doc = null;
        db.emit = function (k,v) {
            results.push({id:_doc._id, doc:_doc, key:k||null, value:v||null});
        };
        docs.forEach(function (doc) {
            if (doc._deleted) return;
            map.call(db, _doc = doc);
        });
        delete db.emit;
        
        return (cmp) ? results.sort(function (a,b) {
            return cmp(a.key, b.key);
        }) : results;
    };
    
    db.since = function (seq) {
        return db.query(function (doc) {
            if (doc._seq > seq) this.emit(doc._seq);
        }, true).map(function (row) {
            var result = {seq:row.key, doc:row.doc, id:row.id};
            if (row.doc._deleted) result.deleted = true;
            return result;
        });
    };
    
    var watchers = [];
    db.watch = function (cb) { watchers.push(cb); };
    db.clear = function (cb) { watchers.splice(watchers.indexOf(cb), 1); };
    function notify(doc) {
        watchers.forEach(function (cb) {
            var result = {seq:doc._dbseq, doc:doc, id:doc._id};
            if (doc._deleted) result.deleted = true;
            cb.call(db, result);
        });
    }
    
    return db;
};

if (typeof module === 'object') module.exports = memcouch;