const test = require('ava')
const { FirestoreSimple } = require('../src/index.js')
const { deleteCollection, createRandomCollectionName, initFirestore } = require('./util')

const db = initFirestore()
const collectionPath = createRandomCollectionName()
const dao = new FirestoreSimple(db, collectionPath, {
  bookTitle: "book_title",
})
const existsDocId = 'test'
const existsDoc = {
  book_title: 'title',
}

test.before(async t => {
  await dao.collectionRef.doc(existsDocId).set(existsDoc)
})

// Delete all documents. (= delete collection)
test.after.always(async t => {
  await deleteCollection(db, collectionPath)
})

test('fetchDocument with toDoc mapping', async t => {
  const doc = await dao.fetchDocument(existsDocId)
  const expectDoc = {
    id: existsDocId,
    bookTitle: existsDoc.book_title,
  }

  t.deepEqual(doc, expectDoc)
})

test('add with toDoc mapping', async t => {
  const title = 'add'
  const doc = {
    bookTitle: title,
  }
  const addedDoc = await dao.add(doc)
  const expectDoc = Object.assign({id: addedDoc.id}, doc)
  t.deepEqual(expectDoc, addedDoc, 'return object keys are equal')

  const fetchedDoc = await dao.collectionRef.doc(addedDoc.id).get()
  t.deepEqual(fetchedDoc.data(), { book_title: title }, 'fetched object')
})

test('set with toDoc mapping', async t => {
  const addedDoc = await dao.collectionRef.add({
    book_title: 'hogehoge',
  })
  const title = 'set'
  const setDoc = {
    id: addedDoc.id,
    bookTitle: title,
  }
  const setedDoc = await dao.set(setDoc)
  t.deepEqual(setDoc, setedDoc, 'return object keys are equal')

  const fetchedDoc = await dao.collectionRef.doc(addedDoc.id).get()
  t.deepEqual(fetchedDoc.data(), { book_title: title }, 'fetched object')
})
