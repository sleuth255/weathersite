var express = require('express')
, request = require('request')
, routes = require('routes')
, user = require('user')
, http = require('http')
, LocalStorage = require('node-localstorage').LocalStorage
, udp = require('dgram')
, buffer = require('buffer')
, suncalc = require('suncalc')
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
 	       heading='N';left=226;top=103;rotation=0;
 	       break;
       case (direction < 45):
    	   heading='NNE';left=276;top=113;rotation=22.5;
    	   break;
       case (direction < 67.5):
    	   heading='NE';left=318;top=142;rotation=45;
    	   break;
       case (direction < 90):
    	   heading='ENE';left=346;top=185;rotation=67.5;
    	   break;
       case (direction < 112.5):
    	   heading='E';left=355;top=235;rotation=90;
    	   break;
       case (direction < 135):
    	   heading='ESE';left=345;top=283;rotation=112.50;
    	   break;
       case (direction < 157.5):
    	   heading='SE';left=316;top=325;rotation=135;
    	   break;
       case (direction < 180):
    	   heading='SSE';left=273;top=353;rotation=157.5;
    	   break;
       case (direction < 202.5):
    	   heading='S';left=224;top=362;rotation=180;
    	   break;
       case (direction < 225):
    	   heading='SSW';left=174;top=351;rotation=202.5;
    	   break;
       case (direction < 247.5):
    	   heading='SW';left=132;top=323;rotation=225;
    	   break;
       case (direction < 270):
    	   heading='WSW';left=104;top=280;rotation=247.5;
    	   break;
       case (direction < 292.5):
    	   heading='W';left=95;top=231;rotation=270;
    	   break;
       case (direction < 315):
    	   heading='WNW';left=105;top=183;rotation=292.5;
    	   break;
       case (direction < 337.5):
    	   heading='NW';left=133;top=141;rotation=315;
    	   break;
       case (direction < 361):
    	   heading='NNW';left=176;top=112;rotation=337.5;
    	   break;
       default:
           break;
    }
    return {heading: heading,left: left,top: top,rotation: rotation};
}
/***************************************************************/
// globals
const white = '#ffffff'
const black = '#000000'
let cookie = {};
var direction = 0;
var lastDirection3 = lastDirection2 = lastDirection1 = lastDirection = 0;
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
var rainStormStart = '';
var rainStormAmt = 0;
var rainStormRate = 0;
var daytime = 1;

//process...
app.get('/', function (req, res) {
	var directionObj = []
	directionObj[0] = makeCompassVector(direction)
	directionObj[1] = makeCompassVector(lastDirection);
	directionObj[2] = makeCompassVector(lastDirection1);
	directionObj[3] = makeCompassVector(lastDirection2);
	directionObj[4] = makeCompassVector(lastDirection3);
	
    res.render('defaultresponse',{day: daytime,directionObj: directionObj,rainStormStart: rainStormStart,rainStormAmt: rainStormAmt,rainStormRate: rainStormRate,outTempTrend: outTempTrend,speed:speed,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/liveconditions', function (req, res) {
    res.render('liveconditions',{day: daytime,rainStormStart: rainStormStart,rainStormAmt: rainStormAmt,rainStormRate: rainStormRate,outTempTrend: outTempTrend,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/livewind', function (req, res) {
    res.locals.err = false;
	var directionObj = []
	directionObj[0] = makeCompassVector(direction)
	directionObj[1] = makeCompassVector(lastDirection);
	directionObj[2] = makeCompassVector(lastDirection1);
	directionObj[3] = makeCompassVector(lastDirection2);
	directionObj[4] = makeCompassVector(lastDirection3);
    res.render('livewind',{day: daytime,directionObj: directionObj,speed:speed})
})
app.get('/testpattern', function (req, res) {
    res.locals.err = false;
	var directionObj = []
	var y = 0
	for (var x = 1;x<360;x+=22.5){
	    directionObj[y++] = makeCompassVector(x)
	}
	console.log(directionObj.length)
    res.render('testpattern',{directionObj: directionObj})
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
	  if (direction != lastDirection){
	     lastDirection3 = lastDirection2;
	     lastDirection2 = lastDirection1;
	     lastDirection1 = lastDirection;
	     lastDirection = direction;
      }
	  speed=Math.round(obj.conditions[0].wind_speed_last);
	  gustDirection=obj.conditions[0].wind_dir_at_hi_speed_last_10_min;
	  gustSpeed=Math.round(obj.conditions[0].wind_speed_hi_last_10_min);
	  //rainStormStart='1603243501';
	  rainStormStart=obj.conditions[0].rain_storm_start_at
	  rainStormAmt=obj.conditions[0].rain_storm *.01
	  rainStormRate=obj.conditions[0].rain_rate_last *.01
	  
	  if (rainStormStart == null)
		  rainStormStart = ''
	  else
		  rainStormStart = app.locals.moment.unix(rainStormStart).format('MMM Do, h:mm a')
});


//Tell WLL to start send live data every 5 minutes and repeat request every 5 minutes

console.log(app.locals.moment(Date.now()).format('MM/DD/YY h:mm:ss a')+': Retrieving current conditions')
http.get('http://10.0.0.42/v1/current_conditions',function(resp){
	data = '';
	resp.on('data',function(chunk){
		data+=chunk
	})
	resp.on('end',function(){
		console.log(data.toString())
		var obj = JSON.parse(data);
		avgSpeed = Math.round(obj.data.conditions[0].wind_speed_avg_last_10_min);
		avgDirection = Math.round(obj.data.conditions[0].wind_dir_scalar_avg_last_10_min);
		inTemp = Math.round(obj.data.conditions[obj.data.conditions.length-2].temp_in);
		inHum = Math.round(obj.data.conditions[obj.data.conditions.length-2].hum_in);
		outTemp = Math.round(obj.data.conditions[0].temp);
		outTempLastReading = obj.data.conditions[0].temp;
		outHum = Math.round(obj.data.conditions[0].hum);
		outDewPt = Math.round(obj.data.conditions[0].dew_point);
		outWindChill = Math.round(obj.data.conditions[0].wind_chill);
		outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
		inBarometer = Math.round((obj.data.conditions[obj.data.conditions.length-1].bar_sea_level)*100)/100
		inBarometerTrend = obj.data.conditions[obj.data.conditions.length-1].bar_trend
		if (inBarometerTrend < 0)
			inBarometerTrend = 'Falling'
		else
		if (inBarometerTrend > 0)
			inBarometerTrend = 'Rising'
		else
			inBarometerTrend = 'Steady'
		http.get('http://10.0.0.42/v1/real_time?duration=300',function(resp){
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
	   http.get('http://10.0.0.42/v1/current_conditions',function(resp){
		   data = '';
		   resp.on('data',function(chunk){
			   data+=chunk
		   })
		   resp.on('end',function(){
			   var obj = JSON.parse(data);
			   avgSpeed = Math.round(obj.data.conditions[0].wind_speed_avg_last_10_min);
			   avgDirection = Math.round(obj.data.conditions[0].wind_dir_scalar_avg_last_10_min);
			   inTemp = Math.round(obj.data.conditions[obj.data.conditions.length-2].temp_in);
			   inHum = Math.round(obj.data.conditions[obj.data.conditions.length-2].hum_in);
			   outTemp = Math.round(obj.data.conditions[0].temp);
			   outHum = Math.round(obj.data.conditions[0].hum);
			   outDewPt = Math.round(obj.data.conditions[0].dew_point);
			   outWindChill = Math.round(obj.data.conditions[0].wind_chill);
			   outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
			   inBarometer = Math.round((obj.data.conditions[obj.data.conditions.length-1].bar_sea_level)*100)/100
			   inBarometerTrend = obj.data.conditions[obj.data.conditions.length-1].bar_trend
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
			      http.get('http://10.0.0.42/v1/real_time?duration=300',function(resp){
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

// periodically determine day/night

setInterval(function(){
	var now = new Date();
	var obj = suncalc.getTimes(now,42.9764,-88.1084)
	if (now > obj.dusk && now < obj.dawn)
		daytime = 0;
	else
		daytime = 1;
}, 600000); 


//Start up server

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});


