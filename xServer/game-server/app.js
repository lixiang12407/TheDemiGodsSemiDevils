var pomelo = require('pomelo');
var logger = require('pomelo-logger').getLogger('pomelo');
var express = require("express");
var bodyParser = require('body-parser');
var GeneralConfigMan = require("./app/common/GeneralConfigMan");

/**
 * Init app for client.
 */
var app = pomelo.createApp();
app.set('name', 'xServer');

// app configuration
app.configure('production|development', 'connector', function(){
  app.set('connectorConfig',
    {
      connector : pomelo.connectors.hybridconnector,
      heartbeat : 3,
      useDict : true,
      useProtobuf : true
    });
});

app.configure('production|development', 'master|connector|zgate|logic|social|balance', function () {
    var env = app.get('env');
    logger.info("env is " + env);
    GeneralConfigMan.getInstance().loadConfig(env);
});

app.configure('production|development', 'zgate', function(){
	var SocketNet = require("./modules/SocketNet");
	var MsgProtobuf = require("./modules/MsgProtobuf");
	var ProtocolRegistry = require('./app/servers/zgate/ProtocolRegistry');
	var BaseService = require('./app/servers/zgate/BaseService');
	var CenterServerMgr = require('./app/servers/zgate/CenterServerMgr');
	var zgate = new SocketNet;
	if (MsgProtobuf.getInstance().loadProto()) {
		ProtocolRegistry.register();
		zgate.start_server(BaseService.serverObj,
			function(service){
				CenterServerMgr.Init(service);
			}
		);
	}
});

app.configure('production|development', 'social', function() {
	// http request service
    var httpApiPort = GeneralConfigMan.getInstance().getConfig().serverApiPort;
    var httpMonitorPort = GeneralConfigMan.getInstance().getConfig().httpServerPort;
    if (!httpApiPort || !httpMonitorPort) {
    	logger.error('http service port error! please check general_config.json');
        return;
    }
    var httpServer = express();
    httpServer.enable('trust proxy');
    httpServer.use(bodyParser.json({ limit: '20mb' }));
    httpServer.use(bodyParser.urlencoded({ limit: '20mb', extended: false }));

    var serverApiRouter = require('./app/servers/social/ServerApiRouter');
    httpServer.use('/', serverApiRouter);

    httpServer.listen(httpApiPort);
    logger.info("start social service api on port " + httpApiPort);

    // http monitor service
    var httpMonitorServer = express();
    var viewsDir = __dirname + "/views/";
    httpMonitorServer.set('views', viewsDir); // tells Express where our views are stored
    logger.info("set views dir " + viewsDir);
    httpMonitorServer.set('view engine', 'blade');
    httpMonitorServer.use(express.static(__dirname + '/public'));
    httpMonitorServer.enable('trust proxy');
    httpMonitorServer.use(bodyParser.json({ limit: '20mb' }));
    httpMonitorServer.use(bodyParser.urlencoded({ limit: '20mb', extended: false }));
    httpMonitorServer.locals.moment = require('moment');

    var adminRouter = require('./app/servers/social/AdminRouter');
    httpMonitorServer.use('/admin', adminRouter);

    //var socialRouter = require('./app/servers/social/SocialRouter');
    //httpMonitorServer.use('/', socialRouter);

    httpMonitorServer.listen(httpMonitorPort);
    logger.info("start http monitor service on port " + httpMonitorPort);
});

var logicRoute = function(playerid, msg, app, cb) {
    var logicServers = app.getServersByType('logic');
    if (!logicServers || logicServers.length === 0) {
        throw new Error("0 logic servers to route");
    }
    var index = playerid % logicServers.length;
    cb(null, logicServers[index].id);
};
app.configure('production|development', function() {
    app.route('logic', logicRoute);
});

var balanceRoute = function(playerid, msg, app, cb) {
    var balanceServers = app.getServersByType('balance');
    if (!balanceServers || balanceServers.length === 0) {
        throw new Error("0 balance servers to route");
    }
    var index = playerid % balanceServers.length;
    cb(null, balanceServers[index].id);
};
app.configure('production|development', function() {
    app.route('balance', balanceRoute);
});

// start app
app.start();

process.on('uncaughtException', function (err) {
  console.error(' Caught exception: ' + err.stack);
});
