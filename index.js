'use strict'

var C = require('./constants')

exports.constants = C

exports.request = {
  decode: function () {
    var obj = decode.apply(null, arguments)
    exports.request.decode.bytes = decode.bytes
    obj.operationId = obj._oprationIdOrStatusCode
    delete obj._oprationIdOrStatusCode
    return obj
  },
  encode: encode,
  encodingLength: encodingLength
}

exports.response = {
  decode: function () {
    var obj = decode.apply(null, arguments)
    exports.response.decode.bytes = decode.bytes
    obj.statusCode = obj._oprationIdOrStatusCode
    delete obj._oprationIdOrStatusCode
    return obj
  },
  encode: encode,
  encodingLength: encodingLength
}

function decode (buf, offset, len) {
  if (!offset) offset = 0
  if (!len) len = buf.length
  var oldOffset = offset

  var obj = {
    version: {},
    groups: []
  }

  obj.version.major = buf.readInt8(offset++)
  obj.version.minor = buf.readInt8(offset++)
  obj._oprationIdOrStatusCode = buf.readInt16BE(offset)
  offset += 2
  obj.requestId = buf.readInt32BE(offset)
  offset += 4

  // attribute groups
  var tag = buf.readInt8(offset++) // delimiter-tag
  while (tag !== C.END_OF_ATTRIBUTES_TAG && offset < len) {
    var group = { tag: tag, attributes: [] }

    // attribute-with-one-value or additional-value
    tag = buf.readInt8(offset++) // value-tag
    while (tag > 0x0f) {
      var name = str.decode(buf, offset)
      offset += str.decode.bytes

      var val
      switch (tag) {
        case C.INTEGER:
          val = tint.decode(buf, offset)
          offset += tint.decode.bytes
          break
        case C.BOOLEAN:
          val = tbool.decode(buf, offset)
          offset += tbool.decode.bytes
          break
        case C.ENUM:
          val = tenum.decode(buf, offset)
          offset += tenum.decode.bytes
          break
        default:
          val = str.decode(buf, offset)
          offset += str.decode.bytes
      }

      if (!name) {
        attr.values.push(val)
      } else {
        var attr = { tag: tag, name: name, values: [val] }
        group.attributes.push(attr)
      }

      tag = buf.readInt8(offset++) // delimiter-tag or value-tag
    }

    obj.groups.push(group)
  }

  obj.data = buf.slice(offset, len)

  decode.bytes = len - oldOffset

  return obj
}

function encode (obj, buf, offset) {
  if (!buf) buf = new Buffer(encodingLength(obj))
  if (!offset) offset = 0
  var oldOffset = offset

  buf.writeInt8(obj.version ? obj.version.major : 1, offset++)
  buf.writeInt8(obj.version ? obj.version.minor : 1, offset++)

  buf.writeInt16BE(obj.statusCode === undefined ? obj.operationId : obj.statusCode, offset)
  offset += 2

  buf.writeInt32BE(obj.requestId, offset)
  offset += 4

  if (obj.groups) {
    obj.groups.forEach(function (group) {
      buf.writeInt8(group.tag, offset++)

      group.attributes.forEach(function (attr) {
        var values = attr.value ? [attr.value] : attr.values
        values.forEach(function (val, i) {
          buf.writeInt8(attr.tag, offset++)

          str.encode(i ? '' : attr.name, buf, offset)
          offset += str.encode.bytes

          switch (attr.tag) {
            case C.INTEGER:
              tint.encode(val, buf, offset)
              offset += tint.encode.bytes
              break
            case C.BOOLEAN:
              tbool.encode(val, buf, offset)
              offset += tbool.encode.bytes
              break
            case C.ENUM:
              tenum.encode(val, buf, offset)
              offset += tenum.encode.bytes
              break
            default:
              str.encode(val, buf, offset)
              offset += str.encode.bytes
          }
        })
      })
    })
  }

  buf.writeInt8(C.END_OF_ATTRIBUTES_TAG, offset++)

  if (obj.data) offset += obj.data.copy(buf, offset)

  encode.bytes = offset - oldOffset

  return buf
}

function encodingLength (obj) {
  var len = 8 // version-number + status-code + request-id

  if (obj.groups) {
    len += obj.groups.reduce(function (len, group) {
      len += 1 // begin-attribute-group-tag
      len += group.attributes.reduce(function (len, attr) {
        var values = attr.value === undefined ? attr.values : [attr.value]
        len += values.reduce(function (len, val) {
          len += 1 // value-tag
          len += str.encodingLength(len === 1 ? attr.name : '')

          switch (attr.tag) {
            case C.INTEGER: return len + tint.encodingLength(val)
            case C.BOOLEAN: return len + tbool.encodingLength(val)
            case C.ENUM: return len + tenum.encodingLength(val)
            default: return len + str.encodingLength(val)
          }
        }, 0)

        return len
      }, 0)
      return len
    }, 0)
  }

  len++ // end-of-attributes-tag

  if (obj.data) len += obj.data.length

  return len
}

var tint = {}

tint.decode = function (buf, offset) {
  var i = buf.readInt32BE(offset + 2)
  tint.decode.bytes = 6
  return i
}

tint.encode = function (i, buf, offset) {
  buf.writeInt16BE(0x01, offset)
  buf.writeInt32BE(i, offset + 2)
  tint.encode.bytes = 6
  return buf
}

tint.encodingLength = function (s) {
  return 6
}

var tenum = {}

tenum.decode = function (buf, offset) {
  var i = buf.readInt32BE(offset + 2)
  tenum.decode.bytes = 6
  return i
}

tenum.encode = function (i, buf, offset) {
  buf.writeInt16BE(0x01, offset)
  buf.writeInt32BE(i, offset + 2)
  tenum.encode.bytes = 6
  return buf
}

tenum.encodingLength = function (s) {
  return 6
}

var tbool = {}

tbool.decode = function (buf, offset) {
  var b = buf.readInt8(offset + 2) === C.TRUE
  tbool.decode.bytes = 3
  return b
}

tbool.encode = function (b, buf, offset) {
  buf.writeInt16BE(0x01, offset)
  buf.writeInt8(b ? C.TRUE : C.FALSE, offset + 2)
  tbool.encode.bytes = 3
  return buf
}

tbool.encodingLength = function (s) {
  return 3
}

var str = {}

str.decode = function (buf, offset) {
  var len = buf.readInt16BE(offset)
  var s = buf.toString('utf-8', offset + 2, offset + 2 + len)
  str.decode.bytes = len + 2
  return s
}

str.encode = function (s, buf, offset) {
  var len = buf.write(s, offset + 2)
  buf.writeInt16BE(len, offset)
  str.encode.bytes = len + 2
  return buf
}

str.encodingLength = function (s) {
  return Buffer.byteLength(s) + 2
}