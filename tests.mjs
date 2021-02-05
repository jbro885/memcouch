import { strict as assert } from 'assert';

import Memcouch from "./memcouch.mjs";

let db = new Memcouch();
let arr, doc, tok;    // reused below
const _conflict = Symbol.for('memcouch._conflict');


let notifyCount = 0;
const countNotifications = () => {
  ++notifyCount;
};

const unsubscribe = db.subscribe(countNotifications);

arr = Array.from(db.allDocs);
assert.equal(arr.length, 0, "How could there be docs even??");
assert.equal(notifyCount, 0, "Yeah, no.");

db.update(doc = {_id:'A', _rev:1, value:0});
arr = Array.from(db.allDocs);
assert.equal(arr.length, 1, "Should contain one doc.");
assert.equal(arr[0], doc, "Doc should have original identity.");
assert.equal(notifyCount, 1, "Subscriber should get notified.");

const unsubscribe2 = db.subscribe(countNotifications);

notifyCount = 0;
db.edit(doc = {_id:'A', _rev:1, value:1});
arr = Array.from(db.allDocs);
assert.equal(arr.length, 1, "Should still contain only one document.");
assert.notEqual(arr[0].value, 0, "Doc should NOT have original content.");
assert.equal(arr[0], doc, "Should contain new document object.");
assert.equal(notifyCount, 2, "Subscriber callback should have fired twice (once for each subscriber).");

unsubscribe2();
notifyCount = 0;
db.update(tok = {_id:'A', _rev:2, value:42});
arr = Array.from(db.allDocs);
assert.equal(arr.length, 1, "Should STILL contain only one document.");
assert.equal(arr[0], doc, "Should still expose locally-edited doc.");
assert.equal(arr[0][_conflict], tok, "Potential conflict should be noted.");
assert.equal(notifyCount, 1, "Subscriber callback should have fired once (for remaining subscriber, on account of conflict)");

assert.doesNotThrow(() => {
  unsubscribe2();
  unsubscribe2();
}, "No problem calling unsubscribe helper multiple times");

db.edit(doc = {_id:'A', _rev:2, value:43});
db.updateFromEdit('A', db.currentEditToken, 3);
arr = Array.from(db.allDocs);
assert.equal(arr[0], doc, "The locally-edited _content_ should abide.");
assert.equal(_conflict in arr[0], false, "Conflict should be resolved.");
assert.equal(doc._rev, 3, "Revision should be up-to-date.");
arr = Array.from(db.localEdits);
assert.equal(arr.length, 0, "Should be clear of local edits.");

db.update(doc = {_id:'A', _rev:3, value:43, ts:"2021"});
arr = Array.from(db.allDocs);
assert.equal(arr[0], doc, "The remote content should prevail.");
assert.equal(arr.length, 1, "And still only one document.");

db.edit({_id:'A', _rev:3, value:50});
db.update(doc = {_id:'A', _rev:4, value:44});
arr = Array.from(db.allDocs);
assert.equal(arr[0][_conflict], doc, "Sequence should result in a conflict…");
assert.equal(arr[0].value, 50, "…but the local content should be used.");

tok = db.currentEditToken;
db.edit(doc = {_id:'B', value:true});
arr = Array.from(db.allDocs);
assert.equal(arr.length, 2, "Should now contain two documents.");
arr = Array.from(db.localEdits);
assert.equal(arr.length, 2, "Should see two outstanding local edits.");
arr = Array.from(db.localEditsSinceToken(tok));
assert.equal(arr.length, 1, "Should only see one edit relative to checkpoint.");

notifyCount = 0;
tok = db.currentEditToken;
db.update({_id:'C', isFor:"cookies"});
assert.equal(db.currentEditToken, tok, "Edit token only changes on edits, not updates.");
assert.equal(notifyCount, 1, "But subscriber should still have been notified.");
db.edit(doc = {_id:'C', isFor:"shanties"});
arr = Array.from(db.localEditsSinceToken(tok));
assert.equal(arr.length, 1, "Should again see just one edit relative to new checkpoint.");
assert.equal(arr[0], doc, "The edit should be the expected one.");

notifyCount = 0;
db.update({_id:'C', isFor:"ignoring"});
assert.equal(notifyCount, 0, "Shadowed change should not notify subscriber.");

db.edit({_id:'D'});
tok = db.currentEditToken;
db.edit({_id:'D', change:true});
db.updateFromEdit('D', tok, "1-x");
arr = Array.from(db.localEditsSinceToken(tok));
assert.equal(arr.length, 1, "Edit made e.g. in midst of save should persist");
assert.equal(arr[0].change, true, "Successful save of earlier version shouldn't drop ongoing changes.");
db.updateFromEdit('D', db.currentEditToken, "2-y");
arr = Array.from(db.localEditsSinceToken(tok));
assert.equal(arr.length, 0, "After subsequent save, should reflect no local edits this time.");

arr = Array.from(db.localEdits);
assert.equal(arr.length, 3, "Earlier edits (to A/B/C) should still be visible.");
db.updateFromEdit('A');
db.updateFromEdit('B');
db.updateFromEdit('C');
arr = Array.from(db.localEdits);
assert.equal(arr.length, 0, "No more edits should be outstanding.");
arr = Array.from(db.allDocs);
assert.equal(arr.length, 4, "There should now be four documents total.");

db.edit(doc = {_id:'E'});
db.updateFromEdit('E', db.currentEditToken, "1-x");
db.edit(Object.assign(doc, {work:"ongoing"}));
db.update({_id:'E', _rev:"1-x"});
arr = Array.from(db.allDocs).filter(d => d._id === 'E');
assert.equal(_conflict in arr[0], false, "Sequence should NOT result in a conflict…");
assert.equal(arr[0], doc, "…but correct document should be in use…");
assert.equal(arr[0].work, "ongoing", "…with the local edits visible.");
db.update(doc = {_id:'E', _rev:"2-y"});
arr = Array.from(db.allDocs).filter(d => d._id === 'E');
assert.equal(arr[0][_conflict], doc, "Now there should be a conflict.");
assert.equal(arr[0].work, "ongoing", "Yet the local edits remain visible.");

tok = db.currentEditToken;
db.edit({_id:'B', _deleted:true});
arr = Array.from(db.allDocs).filter(d => d._id === 'B');
assert.equal(arr.length, 0, "Deleted document should not appear in allDocs.");
arr = Array.from(db.localEditsSinceToken(tok)).filter(d => d._id === 'B');
assert.equal(arr.length, 1, "Deleted document should yes appear in localEdits…");
db.edit({_id:'F'});
tok = db.currentEditToken;
db.edit({_id:'F', _deleted:true});
arr = Array.from(db.localEdits).filter(d => d._id === 'F');
assert.equal(arr.length, 0, "…unless they were only ever local in the first place.");
db.updateFromEdit('F', tok, "1-x");
arr = Array.from(db.localEdits).filter(d => d._id === 'F');
assert.equal(arr.length, 1, "Except if it turns out we did save an earlier version, deletion is an edit.");
db.updateFromEdit('B');

console.log("allDocs:", [...db.allDocs]);
console.log("localEdits:", [...db.localEdits]);

console.log("which tests that do exist, they did all pass.");
