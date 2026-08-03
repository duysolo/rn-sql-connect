const path = require('path')

const pkg = require('../packages/rn-sql-connect/package.json')

module.exports = {
  dependencies: {
    [pkg.name]: {
      root: path.join(__dirname, '..', 'packages', 'rn-sql-connect'),
    },
  },
}
