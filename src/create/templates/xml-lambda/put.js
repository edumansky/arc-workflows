let arc = require('@architect/functions')

function route(req, res) {
  console.log(JSON.stringify(req, null, 2))
  res({
    xml: '<message>hello world from put</message>'
  })
}

exports.handler = arc.xml.put(route)
