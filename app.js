var express = require('express')
, request = require('request')
, routes = require('routes')
, user = require('user')
, http = require('http')
, LocalStorage = require('node-localstorage').LocalStorage
, udp = require('dgram')
, buffer = require('buffer')
, path = require('path');

var app = express();
var server = udp.createSocket('udp4'); 
server.bind(22222);
app.locals.moment = require('moment');

//all environments

app.set('port', process.env.PORT || 5000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

/***************************************************************/

let cookie = {};
var direction = 0;
var speed = 0;
var gustSpeed = 0;
var gustDirection = 0;
var avgSpeed = 0
var avgDirection = 0
var currentConditions;
//process...
app.get('/', function (req, res) {
    res.render('defaultresponse',{avgSpeed: Math.floor(avgSpeed),avgDirection: avgDirection,gustSpeed: gustSpeed,gustDirection: gustDirection})
})
app.get('/liveconditions', function (req, res) {
    res.render('liveconditions',{avgSpeed: Math.floor(avgSpeed),avgDirection: avgDirection,gustSpeed: gustSpeed,gustDirection: gustDirection})
})
app.get('/livewind', function (req, res) {
	var heading,left,top,rotation;
    res.locals.err = false;
    switch(true){
    case (direction == 0):
    	   heading='';left=top=rotation=0;
           break;
       case (direction < 22.5):
 	       heading='N';left=220;top=100;rotation=0;
 	       break;
       case (direction < 45):
    	   heading='NNE';left=265;top=125;rotation=22.5;
    	   break;
       case (direction < 67.5):
    	   heading='NE';left=310;top=150;rotation=45;
    	   break;
       case (direction < 90):
    	   heading='ENE';left=332;top=190;rotation=67.5;
    	   break;
       case (direction < 112.5):
    	   heading='E';left=354;top=230;rotation=90;
    	   break;
       case (direction < 135):
    	   heading='ESE';left=332;top=273;rotation=112.50;
    	   break;
       case (direction < 157.5):
    	   heading='SE';left=310;top=315;rotation=135;
    	   break;
       case (direction < 180):
    	   heading='SSE';left=265;top=336;rotation=157.5;
    	   break;
       case (direction < 202.5):
    	   heading='S';left=220;top=356;rotation=180;
    	   break;
       case (direction < 225):
    	   heading='SSW';left=182;top=336;rotation=202.5;
    	   break;
       case (direction < 247.5):
    	   heading='SW';left=144;top=315;rotation=225;
    	   break;
       case (direction < 270):
    	   heading='WSW';left=117;top=273;rotation=247.5;
    	   break;
       case (direction < 292.5):
    	   heading='W';left=90;top=230;rotation=270;
    	   break;
       case (direction < 315):
    	   heading='WNW';left=117;top=190;rotation=292.5;
    	   break;
       case (direction < 337.5):
    	   heading='NW';left=144;top=150;rotation=315;
    	   break;
       case (direction < 361):
    	   heading='NNW';left=182;top=125;rotation=337.5;
    	   break;
       default:
    	   heading='';left=top=rotation=0;
           break;
    }
    res.render('livewind',{heading: heading,speed:speed,left:left,top:top,rotation:rotation})
})


//UDP Server

server.on('listening',function(){
  var address = server.address();
  var port = address.port;
  var family = address.family;
  var ipaddr = address.address;
  console.log('UDP Server is listening at port ' + port);
  console.log('UDP Server IP is ' + ipaddr);
  console.log('UDP Server is : ' + family);
});
server.on('message',function(msg,info){
	  //console.log('Data received from client : ' + msg.toString());
	  //console.log('Received %d bytes from %s:%d\n',msg.length, info.address, info.port);
	  var obj = JSON.parse(msg);
	  direction=obj.conditions[0].wind_dir_last;
	  speed=obj.conditions[0].wind_speed_last;
	  gustDirection=obj.conditions[0].wind_dir_at_hi_speed_last_10_min;
	  gustSpeed=obj.conditions[0].wind_speed_hi_last_10_min;
	  //console.log("Wind Direction: "+direction)
});


//Tell WLL to start send live data every 5 minutes and repeat request every 5 minutes

http.get('http://weatherlinklive.tpg/v1/current_conditions',function(resp){
	data = '';
	resp.on('data',function(chunk){
		data+=chunk
	})
	resp.on('end',function(){
		console.log(data.toString())
		var obj = JSON.parse(data);
		avgSpeed = obj.data.conditions[0].wind_speed_avg_last_10_min;
		avgDirection = obj.data.conditions[0].wind_dir_scalar_avg_last_10_min;
		http.get('http://weatherlinklive.tpg/v1/real_time?duration=300',function(resp){
			data = '';
			resp.on('data',function(chunk){
				data+=chunk
			})
			resp.on('end',function(){
				console.log(data.toString())
			})
		})
	})
})


setInterval(function(){
	http.get('http://weatherlinklive.tpg/v1/current_conditions',function(resp){
		data = '';
		resp.on('data',function(chunk){
			data+=chunk
		})
		resp.on('end',function(){
			var obj = JSON.parse(data);
			avgSpeed = obj.data.conditions[0].wind_speed_avg_last_10_min;
			avgDirection = obj.data.conditions[0].wind_dir_scalar_avg_last_10_min;
			http.get('http://weatherlinklive.tpg/v1/real_time?duration=300',function(resp){
				data = '';
				resp.on('data',function(chunk){
					data+=chunk
				})
				resp.on('end',function(){
					console.log(data.toString())
				})
			})
		})
	})
}, 300000); 


//Start up server

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});


