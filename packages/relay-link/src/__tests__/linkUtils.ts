import { fromError } from '../link'

describe('Link utilities:', () => {
  describe('fromError', () => {
    it('acts as error call', done => {
      const error = new Error('I always error')
      const observable = fromError(error)
      return observable
        .toPromise()
        .then(() => done.fail('should not resolve'))
        .catch(actualError => {
          expect(error).toEqual(actualError)
          done()
        })
    })
  })
})
