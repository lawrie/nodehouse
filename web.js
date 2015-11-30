var http = require("http");

function process_request(req, res) {
  var body = "thanks\n";
  var cl = body.length;

  res.writeHead(200, {
    'Content-Length':cl,
    'Content-Type':'text/plain'
  });

  res.end(body);

}

var s = http.createServer(process_request);
s.listen(8088);

