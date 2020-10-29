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
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.logger('dev'));


function makeCompassVector(direction){
	var left=top=rotation=0;
	var heading='';
    switch(true){
    case (direction == 0):
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
    	   heading='W';left=94;top=230;rotation=270;
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
           break;
    }
    return {heading: heading,left: left,top: top,rotation: rotation};
}
/***************************************************************/
// globals
let cookie = {};
var direction = 0;
var speed = 0;
var gustSpeed = 0;
var gustDirection = 0;
var avgSpeed = 0
var avgDirection = 0
var inTemp = 0;
var inHum = 0;
var outTemp = 0;
var outTempLastReading = 0;
var outHum = 0;
var outDewPt = 0;
var outWindChill = 0;
var outHeatIdx = 0;
var outTempTrend = 0;
var inBarometer = 0;
var inBarometerTrend;

//process...
app.get('/', function (req, res) {
    res.render('defaultresponse',{outTempTrend: outTempTrend,heading: makeCompassVector(direction).heading,speed:speed,left:makeCompassVector(direction).left,top:makeCompassVector(direction).top,rotation:makeCompassVector(direction).rotation,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/liveconditions', function (req, res) {
    res.render('liveconditions',{outTempTrend: outTempTrend,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/livewind', function (req, res) {
    res.locals.err = false;
    res.render('livewind',{heading: makeCompassVector(direction).heading,speed:speed,left:makeCompassVector(direction).left,top:makeCompassVector(direction).top,rotation:makeCompassVector(direction).rotation})
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
	  //console.log(msg.toString());
	  var obj = JSON.parse(msg);
	  direction=obj.conditions[0].wind_dir_last;
	  speed=Math.round(obj.conditions[0].wind_speed_last);
	  gustDirection=obj.conditions[0].wind_dir_at_hi_speed_last_10_min;
	  gustSpeed=Math.round(obj.conditions[0].wind_speed_hi_last_10_min);
});


//Tell WLL to start send live data every 5 minutes and repeat request every 5 minutes

console.log(app.locals.moment(Date.now()).format('MM/DD/YY h:mm:ss a')+': Retrieving current conditions')
http.get('http://weatherlinklive.tpg/v1/current_conditions',function(resp){
	data = '';
	resp.on('data',function(chunk){
		data+=chunk
	})
	resp.on('end',function(){
		console.log(data.toString())
		var obj = JSON.parse(data);
		avgSpeed = Math.round(obj.data.conditions[0].wind_speed_avg_last_10_min);
		avgDirection = Math.round(obj.data.conditions[0].wind_dir_scalar_avg_last_10_min);
		inTemp = Math.round(obj.data.conditions[2].temp_in);
		inHum = Math.round(obj.data.conditions[2].hum_in);
		outTemp = Math.round(obj.data.conditions[0].temp);
		outTempLastReading = obj.data.conditions[0].temp;
		outHum = Math.round(obj.data.conditions[0].hum);
		outDewPt = Math.round(obj.data.conditions[0].dew_point);
		outWindChill = Math.round(obj.data.conditions[0].wind_chill);
		outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
		inBarometer = Math.round((obj.data.conditions[3].bar_sea_level)*100)/100
		inBarometerTrend = obj.data.conditions[3].bar_trend
		if (inBarometerTrend < 0)
			inBarometerTrend = 'Falling'
		else
		if (inBarometerTrend > 0)
			inBarometerTrend = 'Rising'
		else
			inBarometerTrend = 'Steady'
		http.get('http://weatherlinklive.tpg/v1/real_time?duration=300',function(resp){
			data = '';
			resp.on('data',function(chunk){
				data+=chunk
			})
			resp.on('end',function(){
				//console.log(data.toString())
			})
		})
	})
})


setInterval(function(){
	try{
	   console.log(app.locals.moment(Date.now()).format('MM/DD/YY h:mm:ss a')+': Retrieving current conditions')
	   http.get('http://weatherlinklive.tpg/v1/current_conditions',function(resp){
		   data = '';
		   resp.on('data',function(chunk){
			   data+=chunk
		   })
		   resp.on('end',function(){
			   var obj = JSON.parse(data);
			   avgSpeed = Math.round(obj.data.conditions[0].wind_speed_avg_last_10_min);
			   avgDirection = Math.round(obj.data.conditions[0].wind_dir_scalar_avg_last_10_min);
			   inTemp = Math.round(obj.data.conditions[2].temp_in);
			   inHum = Math.round(obj.data.conditions[2].hum_in);
			   outTemp = Math.round(obj.data.conditions[0].temp);
			   outHum = Math.round(obj.data.conditions[0].hum);
			   outDewPt = Math.round(obj.data.conditions[0].dew_point);
			   outWindChill = Math.round(obj.data.conditions[0].wind_chill);
			   outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
			   inBarometer = Math.round((obj.data.conditions[3].bar_sea_level)*100)/100
			   inBarometerTrend = obj.data.conditions[3].bar_trend
				if (inBarometerTrend < 0)
					inBarometerTrend = 'Falling'
				else
				if (inBarometerTrend > 0)
					inBarometerTrend = 'Rising'
				else
					inBarometerTrend = 'Steady'
			   if (obj.data.conditions[0].temp > outTempLastReading)
					   outTempTrend = 1;
			   else
			   if (obj.data.conditions[0].temp < outTempLastReading)
				   outTempTrend = -1;
			   else
				   outTempTrend = 0;
			   outTempLastReading = obj.data.conditions[0].temp;
			   try{
			      http.get('http://weatherlinklive.tpg/v1/real_time?duration=300',function(resp){
				      data = '';
				      resp.on('data',function(chunk){
					      data+=chunk
				      })
				      resp.on('end',function(){
					      //console.log(data.toString())
				      })
			      })
			   }
			   catch(err){}
		   })
	   })
	}
	catch(err){}
}, 300000); 


//Start up server

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});


