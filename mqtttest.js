var http = require("http");
var fs = require("fs");
var path = require("path")
var url = require("url");
var mqtt = require('mqtt');
var net = require('net');
var qs = require('querystring');

var client2 = mqtt.connect(options={host: "192.168.0.10", protocolId: 'MQIsdp', protocolVersion: 3 });

var client = mqtt.connect('mqtt://localhost:1883');

var rooms = JSON.parse(fs.readFileSync('rooms.json', 'utf8'));

var response = "";

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

function content_type_for_file(file) {
  var ext = path.extname(file).toLowerCase();
  switch (ext) {
    case ".html" : return "text/html";
    default: return "text/plain";
  }
}

function sendCommand(cmd, core_url, req, res) {
  var client = net.connect({port: 50000,host:"192.168.0.100"},
    function() { //'connect' listener
      console.log('connected to server!');
      console.log("Sending " + cmd);
      client.write(cmd + '\n');
  });

  client.on('data', function(data) {
    console.log(data.toString());
    response = "Reply from '" + cmd + "' : " + data.toString();
    client.end();
  });

  client.on('end', function() {
    process_rooms(core_url, req, res);
    console.log('disconnected from server');
  });
}

function serve_static_file(file, res) {
  fs.exists(file, function (exists) {
    if (!exists) {
      res.writeHead(404, { "Content-Type": "application/json"});
      var out = { error: "not found",
                  message: "'" + file + "' not found" };
      res.end(JSON.stringify(out) + "\n");
      return;
    }

    var rs = fs.createReadStream(file);

    rs.on(
      'error',
      function(e) {
        res.end();
      }
    );

    var ct = content_type_for_file(file);
    res.writeHead(200, { "Content-Type" : ct});
    rs.pipe(res);
  });
}

function process_request(req, res) {
  req.parsed_url = url.parse(req.url, true);
  var core_url = req.parsed_url.pathname;
  response = "";

  console.log("URL is " + core_url);

  // Deal with static files like the style sheet
  if (core_url.substring(0,9) == '/content/') {
    serve_static_file(core_url.substring(1), res);
    return;
  } else if (core_url == "/favicon.ico") {
    serve_static_file(core_url.substring(1), res);
    return;
  }

  // Send command if required
  if (req.method == 'POST') {
    var q = '';

    req.on('data', function (data) {
       q += data;

       if (q.length > 1e6)
         req.connection.destroy();
    });

    req.on('end', function () {
      var post = qs.parse(q);
      sendCommand(post.cmd, core_url, req, res);
    });
  } else process_rooms(core_url, req, res);
}

function process_rooms(core_url, req, res) {
  
  var trailer = '</body></html>';
  var header = '<html><head>';
  if (core_url == "/") {
    // The outer page contains the iframe and form
    var content = '<title>Node.js House</title><link rel="stylesheet" type="text/css" href="content/styles.css"></head><body><h1>House Control</h1><iframe src="rooms" width="950" height="400"></iframe><div><form method="post"> Command: <input type="text" name="cmd"> <input value="Go" type="submit"> </form>' + response + '</div>';

  } else {
    // Otherwise generate room data iframe
    var content = '<meta http-equiv="refresh" content="10"><link rel="stylesheet" type="text/css" href="content/styles.css"><style>body {background-color:#FFDBFB;}</style></head><body>';

    for(var caption in rooms) {
      var topics = rooms[caption];
      var tableHeader = '<table><caption>';
      var captionTrailer = '</caption>';
      var tableTrailer = '</table>';
      content += tableHeader + caption + captionTrailer;
      for(var prop in topics) {
        var pair = topics[prop];
        content += "<tr><td>" + Object.keys(pair)[0] + "</td><td>" + pair[Object.keys(pair)[0]] + "</td></tr>";
      }
      content += tableTrailer;
    }
  }

  var body = header + content + trailer;
  var cl = body.length;

  res.writeHead(200, {
    'Content-Length':cl,
    'Content-Type':'text/html'
  });

  res.end(body);
}

client2.on('connect', function() {
  console.log("emonhub connected");
  client2.subscribe("emonhub/rx/5/values");
});

client2.on('error', function() {
  console.log("emonhub error");
});

client2.on('offline', function() {
  console.log("emonhub offline");
});

client2.on('message', function(topic, message) {
  var msg = message.toString();
  console.log(topic + " : " + msg);
  for (var caption in rooms) {
    var topics = rooms[caption];
    if (topics.hasOwnProperty(topic)) {
      var name = Object.keys(topics[topic])[0];
      var values = msg.split(",");
      console.log("Values: " + values);
      var val = values[0];
      if (topics[topic].hasOwnProperty("scale"))
        val *= topics[topic]["scale"];
      val = isNumeric(val) ? parseFloat(Math.round(val * 100) / 100).toFixed(2) : val;

      topics[topic][name] = val;
    }
  }
});

client.on('connect', function () {
  for (var caption in rooms) {
    var topics = rooms[caption];
    for (var key in topics) {
      if (topics.hasOwnProperty(key)) {
        client.subscribe(key);
      }
    }
  }
});
 
client.on('message', function (topic, message) {
  var msg = message.toString();
  console.log(topic + " : " + msg);
  for (var caption in rooms) {
    var topics = rooms[caption];
    if (topics.hasOwnProperty(topic)) {
      var name = Object.keys(topics[topic])[0];
      var val = msg;
      if (topics[topic].hasOwnProperty("scale")) 
        val *= topics[topic]["scale"];
      val = isNumeric(val) ? parseFloat(Math.round(val * 100) / 100).toFixed(2) : val;

      topics[topic][name] = val;
    }
  }
});

var server = http.createServer(
  function(req, res){
    process_request(req,res);
  }).listen(8088); 

