/*
MIT No Attribution

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const AWS = require('aws-sdk');
const AmaxonDaxClient = require('amazon-dax-client');
const crypto = require('crypto');

// Store this at file level so that it is preserved between Lambda executions
var dynamodb;

exports.handler = function(event, context, callback) {
  event.headers = event.headers || [];
  main(event, context, callback);
};

function main(event, context, callback) {
  // Initialize the 'dynamodb' variable if it has not already been done. This
  // allows the initialization to be shared between Lambda runs to reduce
  // execution time. This will be re-run if Lambda has to recycle the container
  // or use a new instance.
  if(!dynamodb) {
    if(process.env.DAX_ENDPOINT) {
      console.log('Using DAX endpoint', process.env.DAX_ENDPOINT);
      dynamodb = new AmaxonDaxClient({endpoints: [process.env.DAX_ENDPOINT]});
    } else {
      // DDB_LOCAL can be set if using lambda-local with dynamodb-local or another local
      // testing envionment
      if(process.env.DDB_LOCAL) {
        console.log('Using DynamoDB local');
        dynamodb = new AWS.DynamoDB({endpoint: 'http://localhost:8000', region: 'ddblocal'});
      } else {
        console.log('Using DynamoDB');
        dynamodb = new AWS.DynamoDB();
      }
    }
  }

  let body = event.body;
  
  // Depending on the HTTP Method, save or return the URL
  if (event.requestContext.http.method == 'GET') {
    return getUrl(event.pathParameters.id, callback);
  } else if (event.requestContext.http.method == 'POST' && event.body) {

    // if base64 encoded event.body is sent in, decode it
    if (event.isBase64Encoded) {
      let buff = Buffer.from(body, 'base64');
      body = buff.toString('utf-8');
    }

    return setUrl(body, callback);
  } else {
    console.log ('HTTP method ', event.requestContext.http.method, ' is invalid.');
    return done(400, JSON.stringify({error: 'Missing or invalid HTTP Method'}), 'application/json', callback);
  }
}

// Get URLs from the database and return
function getUrl(id, callback) {
  const params = {
    TableName: process.env.DDB_TABLE,
    Key: { id: { S: id } }
  };

  console.log('Fetching URL for', id);
  dynamodb.getItem(params, (err, data) => {
    if(err) {
      console.error('getItem error:', err);
      return done(500, JSON.stringify({error: 'Internal Server Error: ' + err}), 'application/json', callback);
    }

    if(data && data.Item && data.Item.target) {
      let url = data.Item.target.S;
      return done(301, url, 'text/plain', callback, {Location: url});
    } else {
      return done(404, '404 Not Found', 'text/plain', callback);
    }
  });
}

/**
 * Compute a unique ID for each URL.
 *
 * To do this, take the MD5 hash of the URL, extract the first 40 bits, and
 * then return that in base32 representation.
 *
 * If the salt is provided, prepend that to the URL first. This is used to
 * resolve hash collisions.
 *
 */
function computeId(url, salt) {
  if(salt) {
    url = salt + '$' + url
  }

  // For demonstration purposes MD5 is fine
  let md5 = crypto.createHash('md5');

  // Compute the MD5, then use only the first 40 bits
  let h = md5.update(url).digest('hex').slice(0, 10);

  // Return results in base32 (hence 40 bits, 8*5)
  return parseInt(h, 16).toString(32);
}

// Save the URLs to the database
function setUrl(url, callback, salt) {
  let id = computeId(url, salt);

  const params = {
    TableName: process.env.DDB_TABLE,
    Item: {
      id: { S: id },
      target: { S: url }
    },
    // Ensure that puts are idempotent
    ConditionExpression: "attribute_not_exists(id) OR target = :url",
    ExpressionAttributeValues: {
      ":url": {S: url}
    }
  };

  dynamodb.putItem(params, (err, data) => {
    if (err) {
      if(err.code === 'ConditionalCheckFailedException') {
        console.warn('Collision on ' + id + ' for ' + url + '; retrying...');
        // Retry with the attempted ID as the salt.
        // Eventually there will not be a collision.
        return setUrl(url, callback, id);
      } else {
        console.error('Dynamo error on save: ', err);
        return done(500, JSON.stringify({error: 'Internal Server Error: ' + err}), 'application/json', callback);
      }
    } else {
      return done(200, id, 'text/plain', callback);
    }
  });
}

// We're done with this lambda, return to the client with given parameters
function done(statusCode, body, contentType, callback, headers) {
  full_headers = {
    'Content-Type': contentType
  }

  if(headers) {
    full_headers = Object.assign(full_headers, headers);
  }

  callback(null, {
    statusCode: statusCode,
    body: body,
    headers: full_headers,
    isBase64Encoded: false,
  });
}
