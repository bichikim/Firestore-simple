import { FirestoreSimple, FirestoreSimpleCollection } from '../src'
import { createRandomCollectionName, deleteCollection, initFirestore } from './util'

// Workaround for flaky nesting transaction/runBatch test
jest.retryTimes(3)

interface TestDoc {
  id: string,
  title: string,
}

const firestore = initFirestore()
const collectionPath = createRandomCollectionName()

describe('runBatch', () => {
  let firestoreSimple: FirestoreSimple
  let dao: FirestoreSimpleCollection<TestDoc>

  beforeEach(async () => {
    firestoreSimple = new FirestoreSimple(firestore)
    dao = firestoreSimple.collection<TestDoc>({ path: collectionPath })
  })

  // Delete all documents. (= delete collection)
  afterEach(async () => {
    await deleteCollection(firestore, collectionPath)
  })

  describe('context.batch', () => {
    it('should be undefined before runBatch', async () => {
      expect(firestoreSimple.context.batch).toBeUndefined()
    })

    it('should be assigned in runBatch', async () => {
      await firestoreSimple.runBatch(async (batch) => {
        expect(firestoreSimple.context.batch).toBe(batch)
      })
    })

    it('should be undefined after runBatch', async () => {
      await firestoreSimple.runBatch(async () => {
        expect(firestoreSimple.context.batch).not.toBeUndefined()
      })

      expect(firestoreSimple.context.batch).toBeUndefined()
    })

    it('should be error nesting runBatch', async () => {
      await firestoreSimple.runBatch(async () => {
        expect(
          firestoreSimple.runBatch(async () => { dao.add({ title: 'test' }) })
        ).rejects.toThrow()
      })
    })

    it('should be error transaction in runBatch', async () => {
      await firestoreSimple.runBatch(async () => {
        expect(
          firestoreSimple.runTransaction(async () => { dao.add({ title: 'test' }) })
        ).rejects.toThrow()
      })
    })
  })

  describe('write method', () => {
    it('set', async () => {
      const doc = { id: 'test1', title: 'aaa' }
      const updatedDoc = { id: 'test1', title: 'bbb' }
      await dao.set(doc)

      await firestoreSimple.runBatch(async () => {
        await dao.set(updatedDoc)

        // document has not updated yet
        const fetchedOutsideBatch = await dao.fetch(doc.id)
        expect(fetchedOutsideBatch).toEqual(doc)
      })

      // document has updated outside runBatch
      const fetched = await dao.fetch(doc.id)
      expect(fetched).toEqual(updatedDoc)
    })

    it('delete', async () => {
      const doc = { id: 'test1', title: 'aaa' }
      await dao.set(doc)

      await firestoreSimple.runBatch(async () => {
        await dao.delete(doc.id)

        // document has not deleted yet
        const fetchedOutsideBatch = await dao.fetch(doc.id)
        expect(fetchedOutsideBatch).toEqual(doc)
      })

      // document has deleted outside runBatch
      const fetched = await dao.fetch(doc.id)
      expect(fetched).toBeUndefined()
    })

    it('add', async () => {
      let newId: string | undefined
      const doc = { title: 'aaa' }

      await firestoreSimple.runBatch(async () => {
        newId = await dao.add(doc)

        // document has not added yet
        const fetchedOutsideBatch = await dao.fetch(newId)
        expect(fetchedOutsideBatch).toBeUndefined()
      })

      if (!newId) return
      // document has added outside runBatch
      const fetched = await dao.fetch(newId)
      expect(fetched).not.toBeUndefined()
    })

    it('update', async () => {
      const updatedTitle = 'update'
      const doc = { id: 'test2', title: 'aaa' }
      await dao.set(doc)

      await firestoreSimple.runBatch(async () => {
        await dao.update({ id: doc.id, title: updatedTitle })

        // document has not updated yet
        const fetchedOutsideBatch = await dao.fetch(doc.id)
        expect(fetchedOutsideBatch!.title).toEqual(doc.title)
      })

      // document has updated outside runBatch
      const fetched = await dao.fetch(doc.id)
      expect(fetched!.title).toEqual(updatedTitle)
    })
  })

  describe('Collection.context.batch', () => {
    const anotherCollectionPath = createRandomCollectionName()
    let batchAnotherDao: FirestoreSimpleCollection<TestDoc>

    beforeEach(async () => {
      batchAnotherDao = firestoreSimple.collection<TestDoc>({ path: anotherCollectionPath })
    })

    afterEach(async () => {
      await deleteCollection(firestore, anotherCollectionPath)
    })

    it('each collections share same batch context', async () => {
      await firestoreSimple.runBatch(async (batch) => {
        expect(dao.context.batch).toBe(batch)
        expect(batchAnotherDao.context.batch).toBe(batch)
      })
    })

    it('runBatch enables across each collections', async () => {
      // it share same contxt.batch
      const anotherDao = firestoreSimple.collection<TestDoc>({ path: anotherCollectionPath })

      const doc = { id: 'test1', title: 'aaa' }
      await dao.set(doc)
      const anotherDoc = { id: 'test1', title: 'another' }
      await anotherDao.set(anotherDoc)

      const updatedDoc = { id: 'test1', title: 'bbb' }
      const updatedAnotherDoc = { id: 'test1', title: 'another_bbb' }

      await firestoreSimple.runBatch(async () => {
        await dao.set(updatedDoc)
        await batchAnotherDao.set(updatedAnotherDoc)

        // Both documents has not updated yet
        const fetchedOutsideBatch = await dao.fetch(doc.id)
        expect(fetchedOutsideBatch).toEqual(doc)
        const anotherFetchedOutsideBatch = await anotherDao.fetch(anotherDoc.id)
        expect(anotherFetchedOutsideBatch).toEqual(anotherDoc)
      })

      // Both documents has updated outside runBatch
      const fetched = await dao.fetch(doc.id)
      expect(fetched).toEqual(updatedDoc)
      const anotherFetched = await anotherDao.fetch(anotherDoc.id)
      expect(anotherFetched).toEqual(updatedAnotherDoc)
    })

    it('should be error bulkSet in runBatch', async () => {
      await firestoreSimple.runBatch(async () => {
        const doc = [{ id: 'test1', title: 'aaa' }]
        expect(
          dao.bulkSet(doc)
        ).rejects.toThrow()
      })
    })

    it('should be error bulkDelete in runBatch', async () => {
      const doc = { id: 'test1', title: 'aaa' }
      await dao.set(doc)

      await firestoreSimple.runBatch(async () => {
        expect(
          dao.bulkDelete([doc.id])
        ).rejects.toThrow()
      })
    })
  })
})
