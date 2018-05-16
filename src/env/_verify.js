let aws = require('aws-sdk')
let chalk = require('chalk')
let parallel = require('run-parallel')
let series = require('run-series')
let eq = require('shallow-equal/objects')
let path = require('path')
let fs = require('fs')

// arc reserved env vars
let reserved = [
  'ARC_APP_NAME',
  'NODE_ENV',
  'SESSION_TABLE_NAME',
]

// local helpers
let inventory = require('../inventory')
let _longest = require('./_get-longest')
let _all = require('./_all')
let error = msg=> console.log(chalk.bold.red('Error'), chalk.bold.white(msg))

module.exports = function _verify(appname, callback) {
  parallel({
    // get the env vars
    env(callback) {
      _all(appname, callback)
    },
    // get the lambdas
    lambdas(callback) {
      let arcPath = path.join(process.cwd(), '.arc')
      inventory(arcPath, callback)
    }
  },
  function done(err, result) {
    if (err) {
      error(err.message)
    }
    else {
      let lambda = new aws.Lambda
      let testing = result.env.filter(e=> e.env === 'testing')
      let staging = result.env.filter(e=> e.env === 'staging')
      let production = result.env.filter(e=> e.env === 'production')

      // write a local .arc-env
      let envPath = path.join(process.cwd(), '.arc-env')
      fs.writeFileSync(envPath, toArc(testing))

      // printers
      let longest = _longest(result.lambdas.lambdas)
      let _pads = v=> chalk.dim(`${v} `.padEnd(longest, '.')) + ' '
      let error = msg=> console.log(chalk.bold.red('Error'), chalk.bold.white(msg))
      let notfound = name=> console.log(_pads(name), chalk.yellow('not found (run inventory and create to fix)'))
      let ok = name=> console.log(_pads(name), chalk.green('env ok'))

      // walk each lambda
      series(result.lambdas.lambdas.map(FunctionName=> {
        return function _verifyLambda(callback) {
          lambda.getFunctionConfiguration({FunctionName}, function _prettyPrint(err, result) {
            if (err && err.code === 'ResourceNotFoundException') {
              notfound(FunctionName)
              callback()
            }
            else if (err) {
              error(err.message)
              callback()
            }
            else {
              // clean env vars of anything reserved
              let copy = {}
              let saves = {}
              for (let key in result.Environment.Variables) {
                if (!reserved.includes(key)) {
                  copy[key] = result.Environment.Variables[key]
                }
                else {
                  saves[key] = result.Environment.Variables[key]
                }
              }

              let isProduction = result.Environment.Variables.NODE_ENV === 'production'
              let expected = toEnv(isProduction? production : staging)

              if (eq(expected, copy)) {
                ok(FunctionName)
                callback()
              }
              else {
                lambda.updateFunctionConfiguration({
                  FunctionName,
                  Environment: {
                    Variables: {
                      ...expected,
                      ...saves,
                    }
                  }
                },
                function _syncd(err) {
                  if (err) error(err.message)
                  else ok(FunctionName)
                  callback()
                })
              }
            }
          })
        }
      }), callback)
    }
  })
}

function toEnv(vars) {
  let done = {}
  vars.forEach(v=> done[v.name] = v.value)
  return done
}

function toArc(vars) {
  let done = '@testing\n'
  vars.forEach(v=> done += `${v.name} ${v.value}\n`)
  return done
}