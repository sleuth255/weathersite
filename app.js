//
// Settings that you need to change.  
//
// To refresh weathersite code, first copy these to the clipboard
// then open up a command prompt/terminal window and switch to the /weathersite directory
// now do:
//    git reset --hard origin/master
//    git pull origin master
// The codebase will be updated.  Then open app.js in an editor and paste your settings back in.
//
var myLatitude = 42.9764;
var myLongitude = -88.1084;
var myWLLIp = ''; //weathersite will attempt to find your WLL if this not filled in
var myMetarFtpSite = "tgftp.nws.noaa.gov";
var myMetarFilePath = "/data/observations/metar/stations/KMKE.TXT";
var myRadarZoominPath = "https://radar.weather.gov/lite/N0R/MKX_loop.gif"
var myRadarZoomoutPath = "https://s.w-x.co/staticmaps/wu/wu/wxtype1200_cur/uscad/animate.png"
var myClimacellApiKey = "";
// get a free Dev API key from climacell.co to enable active Weather Tile functionality
// for privacy, the key can also can be stored in local storage in a file called "ccApiKey" 
// (see local storage initialization below)
var observationUnits = {
   metricTemp: false,
   metricRain: false,
   metricPressure:  false,
   metricSpeed: false
}
	
//end of settings that you need to change
//

var weatherSiteVersion = '1.4'
var express = require('express')
, request = require('request')
, routes = require('routes')
, user = require('user')
, http = require('http')
, https = require('https')
, LocalStorage = require('node-localstorage').LocalStorage
, udp = require('dgram')
, buffer = require('buffer')
, spawn = require('child_process').spawn
, suncalc = require('suncalc')
, jsftp = require("jsftp")
, clone = require("clone")
, myIpAddress = require("ip").address()
, ifaces = require("os").networkInterfaces()
, linechart = require('./lineChart.json')
, portscanner = require('portscanner')
, path = require('path');

var app = express();
if (myMetarFtpSite.length > 0){
   var ftp = new jsftp({
	   host: myMetarFtpSite
   });
   ftp.keepAlive();
   ftp.on('error', function(err){
	   console.log('Ftp error caught');
	   ftp.raw("QUIT");
	   ftp.destroy();
	   ftp = new jsftp({
		   host: myMetarFtpSite
	   });
   })
}

process.on('uncaughtException', function(err){
	console.error(err.stack);
})

var server = udp.createSocket('udp4'); 
server.bind(22222);
app.locals.moment = require('moment');

//initialize local storage
var oDate,oTemp,oHum,oDewpt,oWindspd,oWinddir,oWindgust,oBarometer
var localStorage = new LocalStorage('/WeathersiteStats'); 

if ((localStorage.getItem("ccApiKey"))!=null)
	myClimacellApiKey = localStorage.getItem("ccApiKey");
else
if (myClimacellApiKey.length > 0)
	localStorage.setItem("ccApiKey",myClimacellApiKey)

if ((localStorage.getItem("myWLLIp"))!=null)
	myWLLIp = localStorage.getItem("myWLLIp");
else
if (myWLLIp.length > 0) // set local storage if hardcoded
	localStorage.setItem("myWLLIp",myWLLIp);


if ((localStorage.getItem("oDate"))==null)
	oDate = [];
else
	oDate = JSON.parse(localStorage.getItem("oDate"));
if ((localStorage.getItem("oTemp"))==null)
	oTemp = [];
else
	oTemp = JSON.parse(localStorage.getItem("oTemp"));
if ((localStorage.getItem("oHum"))==null)
	oHum = [];
else
	oHum = JSON.parse(localStorage.getItem("oHum"));
if ((localStorage.getItem("oDewpt"))==null)
	oDewpt = [];
else
	oDewpt = JSON.parse(localStorage.getItem("oDewpt"));
if ((localStorage.getItem("oWindspd"))==null)
	oWindspd = [];
else
	oWindspd = JSON.parse(localStorage.getItem("oWindspd"));
if ((localStorage.getItem("oWinddir"))==null)
	oWinddir = [];
else
	oWinddir = JSON.parse(localStorage.getItem("oWinddir"));
if ((localStorage.getItem("oWindgust"))==null)
	oWindgust = [];
else
	oWindgust = JSON.parse(localStorage.getItem("oWindgust"));
if ((localStorage.getItem("oBarometer"))==null)
	oBarometer = [];
else
	oBarometer = JSON.parse(localStorage.getItem("oBarometer"));

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


/***************************************************************/
//globals
var myUrl = "http://"+myIpAddress+":"+app.get('port')
var metarObservation = "";
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
var outTempLastReading = null;
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
var forecastObj = {};
var sunrise;
var sunset;
var now = new Date();
var moonIllumination;
var moonsize = makeMoonPhaseVector();
var daytime = suncalc.getTimes(now,myLatitude,myLongitude);
sunrise = daytime.sunrise;
sunset = daytime.sunset;
if ((now > daytime.dusk && now > daytime.dawn) || (now < daytime.dawn && now < daytime.dusk))
	daytime = 0;
else
	daytime = 1;

// Global functions

function startWLLqueries(){
	//Get initial conditions from WLL.
	//Also tell WLL to start broadcasting live UDP Wind/Rainfall data every 5 minutes
	console.log(app.locals.moment(Date.now()).format('MM/DD/YY h:mm:ss a')+': Retrieving current conditions')
	var req1 = http.get('http://'+myWLLIp+'/v1/current_conditions',function(resp){
		data = '';
		resp.on('data',function(chunk){
			data+=chunk
		})
		resp.on('end',function(){
			//console.log(data.toString())
			var obj = JSON.parse(data);
		    var gust = Math.round(obj.data.conditions[0].wind_speed_hi_last_10_min)
		    if (observationUnits.metricSpeed)
		    	gust = Math.round(gust * 1.60934)
			avgSpeed = Math.round(obj.data.conditions[0].wind_speed_avg_last_10_min);
		    if (observationUnits.metricSpeed)
		    	avgSpeed = Math.round(avgSpeed * 1.60934) 
			avgDirection = Math.round(obj.data.conditions[0].wind_dir_scalar_avg_last_10_min);
			inTemp = Math.round(obj.data.conditions[obj.data.conditions.length-2].temp_in);
		    if (observationUnits.metricTemp)
		    	inTemp = Math.round(((inTemp -32) *5)/9)
			inHum = Math.round(obj.data.conditions[obj.data.conditions.length-2].hum_in);
			outTemp = Math.round(obj.data.conditions[0].temp);
			outTempLastReading = Math.round(obj.data.conditions[0].temp);
		    if (observationUnits.metricTemp){
		    	outTemp = Math.round(((outTemp -32) *5)/9)
		    	outTempLastReading = Math.round(((outTempLastReading -32) *5)/9)
		    }
			outHum = Math.round(obj.data.conditions[0].hum);
			outDewPt = Math.round(obj.data.conditions[0].dew_point);
		    if (observationUnits.metricTemp)
		    	outDewPt = Math.round(((outDewPt -32) *5)/9)
			outWindChill = Math.round(obj.data.conditions[0].wind_chill);
			outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
		    if (observationUnits.metricTemp){
		    	outWindChill = Math.round(((outWindChill -32) *5)/9)
		    	outHeatIdx = Math.round(((outHeatIdx -32) *5)/9)
		    }
			inBarometer = Math.round((obj.data.conditions[obj.data.conditions.length-1].bar_sea_level)*100)/100
		    if (observationUnits.metricPressure)
			  inBarometer = (inBarometer * 33.8639).toFixed(1);
			inBarometerTrend = obj.data.conditions[obj.data.conditions.length-1].bar_trend
			if (oDate.length > 143)
				oDate = shiftHist(oDate)
			oDate.push(new Date());
		    localStorage.setItem("oDate",JSON.stringify(oDate));
			if (oTemp.length > 143)
				oTemp = shiftHist(oTemp)
			oTemp.push(outTemp);
		    localStorage.setItem("oTemp",JSON.stringify(oTemp));
			if (oHum.length > 143)
				oHum = shiftHist(oHum)
			oHum.push(outHum);
		    localStorage.setItem("oHum",JSON.stringify(oHum));
			if (oDewpt.length > 143)
				oDewpt = shiftHist(oDewpt)
			oDewpt.push(outDewPt);
		    localStorage.setItem("oDewpt",JSON.stringify(oDewpt));
			if (oWindspd.length > 143)
				oWindspd = shiftHist(oWindspd)
			oWindspd.push(avgSpeed);
		    localStorage.setItem("oWindspd",JSON.stringify(oWindspd));
			if (oWinddir.length > 143)
				oWinddir = shiftHist(oWinddir)
			oWinddir.push(avgDirection);
		    localStorage.setItem("oWinddir",JSON.stringify(oWinddir));
			if (oWindgust.length > 143)
				oWindgust = shiftHist(oWindgust)
			oWindgust.push(gust);
		    localStorage.setItem("oWindgust",JSON.stringify(oWindgust));
			if (oBarometer.length > 143)
				oBarometer = shiftHist(oBarometer)
			oBarometer.push(inBarometer);
		    localStorage.setItem("oBarometer",JSON.stringify(oBarometer));
			if (inBarometerTrend < 0)
				inBarometerTrend = 'Falling'
			else
			if (inBarometerTrend > 0)
				inBarometerTrend = 'Rising'
			else
				inBarometerTrend = 'Steady'
			req1.end();
			console.log('UDP broadcast request begins')
			var req2 = http.get('http://'+myWLLIp+'/v1/real_time?duration=300',function(resp){
				data = '';
				resp.on('data',function(chunk){
					data+=chunk
				})
				resp.on('end',function(){
					console.log('UDP Broadcast request accepted')
					req2.end();
					//console.log(data.toString())
				})
			}).on('error',(err) =>{
				   console.log("UDP broadcast initial request failure")
				   req2.end();
			})
		})
	}).on('error',(err) =>{
		   console.log("Current conditions initial request failure")
		   req1.end();
	})
	// Primary 5 minute weather conditions refresh code block follows
	// get METAR Observation from NOAA FTP site and local conditions from WLL  
	// Tell WLL server to continue to send UDP packets

	setInterval(function(){
		   console.log(app.locals.moment(Date.now()).format('MM/DD/YY h:mm:ss a')+': Retrieving current conditions')
	if (myMetarFtpSite.length > 0){
		   var Observation = ""; // Will store the contents of the file
		   try{
		      console.log('Retrieving METAR observation');
	          ftp.get(myMetarFilePath, (err, socket) => {
	            if (err) {
	              return;
	            }

	            socket.on("data", d => {
	              Observation += d.toString();
	            });

	            socket.on("close", err => {
	              if (err) {
	                console.error("METAR data retrieval error");
	                return;
	              }
	              metarObservation = Observation;
	              console.log("METAR observation retrieved");
	            });
	            socket.resume();
	          });
	   	      }
		      catch(err){
			      console.log('Caught Metar Observation error')
		      }
	       }
		   var req1 = http.get('http://'+myWLLIp+'/v1/current_conditions',function(resp){
			   data = '';
			   resp.on('data',function(chunk){
				   data+=chunk
			   })
			   resp.on('end',function(){
				    console.log('current conditions reply received')
				    var obj = JSON.parse(data);
				    var gust = Math.round(obj.data.conditions[0].wind_speed_hi_last_10_min)
				    if (observationUnits.metricSpeed)
				   	    gust = Math.round(gust * 1.60934)
				    avgSpeed = Math.round(obj.data.conditions[0].wind_speed_avg_last_10_min);
				    if (observationUnits.metricSpeed)
				        avgSpeed = Math.round(avgSpeed * 1.60934) 
				    avgDirection = Math.round(obj.data.conditions[0].wind_dir_scalar_avg_last_10_min);
					inTemp = Math.round(obj.data.conditions[obj.data.conditions.length-2].temp_in);
				    if (observationUnits.metricTemp)
				    	inTemp = Math.round(((inTemp -32) *5)/9)
					inHum = Math.round(obj.data.conditions[obj.data.conditions.length-2].hum_in);
					outTemp = Math.round(obj.data.conditions[0].temp);
					outTempLastReading = Math.round(obj.data.conditions[0].temp);
				    if (observationUnits.metricTemp){
				    	outTemp = Math.round(((outTemp -32) *5)/9)
				    	outTempLastReading = Math.round(((outTempLastReading -32) *5)/9)
				    }
					outHum = Math.round(obj.data.conditions[0].hum);
					outDewPt = Math.round(obj.data.conditions[0].dew_point);
				    if (observationUnits.metricTemp)
				    	outDewPt = Math.round(((outDewPt -32) *5)/9)
					outWindChill = Math.round(obj.data.conditions[0].wind_chill);
					outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
				    if (observationUnits.metricTemp){
				    	outWindChill = Math.round(((outWindChill -32) *5)/9)
				    	outHeatIdx = Math.round(((outHeatIdx -32) *5)/9)
				    }
					inBarometer = Math.round((obj.data.conditions[obj.data.conditions.length-1].bar_sea_level)*100)/100
				    if (observationUnits.metricPressure)
					  inBarometer = (inBarometer * 33.8639).toFixed(1);
					inBarometerTrend = obj.data.conditions[obj.data.conditions.length-1].bar_trend
				    if (oDate.length > 143)
					    oDate = shiftHist(oDate)
				    oDate.push(new Date());
			        localStorage.setItem("oDate",JSON.stringify(oDate));
				    if (oTemp.length > 143)
					    oTemp = shiftHist(oTemp)
				    oTemp.push(outTemp);
				    localStorage.setItem("oTemp",JSON.stringify(oTemp));
				    if (oHum.length > 143)
					    oHum = shiftHist(oHum)
				    oHum.push(outHum);
				    localStorage.setItem("oHum",JSON.stringify(oHum));
				    if (oDewpt.length > 143)
					    oDewpt = shiftHist(oDewpt)
				    oDewpt.push(outDewPt);
				    localStorage.setItem("oDewpt",JSON.stringify(oDewpt));
				    if (oWindspd.length > 143)
					    oWindspd = shiftHist(oWindspd)
				    oWindspd.push(avgSpeed);
				    localStorage.setItem("oWindspd",JSON.stringify(oWindspd));
				    if (oWinddir.length > 143)
					    oWinddir = shiftHist(oWinddir)
				    oWinddir.push(avgDirection);
				    localStorage.setItem("oWinddir",JSON.stringify(oWinddir));
				    if (oWindgust.length > 143)
					    oWindgust = shiftHist(oWindgust)
				    oWindgust.push(gust);
				    localStorage.setItem("oWindgust",JSON.stringify(oWindgust));
				    if (oBarometer.length > 143)
				   	    oBarometer = shiftHist(oBarometer)
				    oBarometer.push(inBarometer);
	  		        localStorage.setItem("oBarometer",JSON.stringify(oBarometer));
				    if (inBarometerTrend < 0)
					    inBarometerTrend = 'Falling'
				    else
				    if (inBarometerTrend > 0)
					    inBarometerTrend = 'Rising'
				    else
					    inBarometerTrend = 'Steady'
				    if (outTempLastReading == null)
					    outTempLastReading == obj.data.conditions[0].temp;
				    if (obj.data.conditions[0].temp > outTempLastReading)
					    outTempTrend = 1;
				    else
				    if (obj.data.conditions[0].temp < outTempLastReading)
					    outTempTrend = -1;
				    else
					    outTempTrend = 0;
				    outTempLastReading = obj.data.conditions[0].temp;

				    console.log('starting WLL UDP refresh request')
				    req1.end();
				    var req2 = http.get('http://'+myWLLIp+'/v1/real_time?duration=300',function(resp){
					    data = '';
					    resp.on('data',function(chunk){
					     data+=chunk
					    })
					    resp.on('end',function(){
					     console.log('UDP request processed')
					     req2.end();
					    })
				    }).on('error',(err) =>{
				 	    console.log("UDP request failure")
				 	    req2.end();
				    })
			    })
		   }).on('error',(err) =>{
			   console.log("Current conditions request failure")
				    oDate.push(new Date());
			        localStorage.setItem("oDate",JSON.stringify(oDate));
				    if (oTemp.length > 143)
					    oTemp = shiftHist(oTemp)
				    oTemp.push(outTemp);
				    localStorage.setItem("oTemp",JSON.stringify(oTemp));
				    if (oHum.length > 143)
					    oHum = shiftHist(oHum)
				    oHum.push(outHum);
				    localStorage.setItem("oHum",JSON.stringify(oHum));
				    if (oDewpt.length > 143)
					    oDewpt = shiftHist(oDewpt)
				    oDewpt.push(outDewPt);
				    localStorage.setItem("oDewpt",JSON.stringify(oDewpt));
				    if (oWindspd.length > 143)
					    oWindspd = shiftHist(oWindspd)
				    oWindspd.push(avgSpeed);
				    localStorage.setItem("oWindspd",JSON.stringify(oWindspd));
				    if (oWinddir.length > 143)
					    oWinddir = shiftHist(oWinddir)
				    oWinddir.push(avgDirection);
				    localStorage.setItem("oWinddir",JSON.stringify(oWinddir));
				    if (oWindgust.length > 143)
					    oWindgust = shiftHist(oWindgust)
				    oWindgust.push(gust);
				    localStorage.setItem("oWindgust",JSON.stringify(oWindgust));
				    if (oBarometer.length > 143)
				   	    oBarometer = shiftHist(oBarometer)
				    oBarometer.push(inBarometer);
	  		        localStorage.setItem("oBarometer",JSON.stringify(oBarometer));
				    if (inBarometerTrend < 0)
					    inBarometerTrend = 'Falling'
				    else
				    if (inBarometerTrend > 0)
					    inBarometerTrend = 'Rising'
				    else
					    inBarometerTrend = 'Steady'
			   req1.end();
		   })
	}, 5*60*1000); 
}

function iterateHttpTargets(list,current){
	portscanner.checkPortStatus(80,list[current],function(error,status){
	   if (status == 'open')
	      request({url: 'http://'+list[current]+'/v1/current_conditions',timeout: 5*1000},function(error,response,body){
		      if (!error && response.statusCode == 200 && body.substr(0,14) == '{"data":{"did"'){
		          console.log('found WLL at '+list[current])
		          localStorage.setItem("myWLLIp",list[current])
		          myWLLIp = list[current];
		          startWLLqueries();
		      }
		      else
		      if (current < list.length)
			      iterateHttpTargets(list,++current)
		      else
				console.log("WLL not found")
	      })
	   else
       if (current < list.length)
		   iterateHttpTargets(list,++current)
	   else
		   console.log("WLL not found")
	})
}
function findWLL(){
	console.log("starting WLL search")
	var ipcidr = require('ip-cidr')
	var myCIDR;
	for (var key in ifaces){
		var info = ifaces[key]
		for(var x=0;x<info.length;x++)
			if (info[x].address == myIpAddress)
	            myCIDR = info[x].cidr
	}
	var cidr = new ipcidr(myCIDR)
	iterateHttpTargets(cidr.toArray(),0)
}
function shiftHist(array){
	var newArray = []
	for(var x = 1; x < array.length; x++)
		newArray.push(array[x])
	return newArray;
}
function makeSkyConditionsVector(){
	var skyconditions = [];
	var obj = {
			skyconditions: 1,
			weather: 'Clear'
	}
	if (metarObservation.indexOf("CLR") != -1){
		obj.skyconditions = 1;
		obj.weather = 'Clear';
	}	
	if (metarObservation.indexOf("FEW") != -1){
		obj. skyconditions = 2;
		obj.weather = 'Mostly Clear';
	}
	if (metarObservation.indexOf("SCT") != -1){
		obj.skyconditions = 3;
		obj.weather = 'Partly Cloudy';
	}
	if (metarObservation.indexOf("BKN") != -1){
		obj.skyconditions = 4;
		obj.weather = 'Mostly Cloudy';
    }
	if (metarObservation.indexOf("OVC") != -1){
		obj. skyconditions = 5;
		obj.weather = 'Overcast';
	}
    if (rainStormRate > 0){
		obj.skyconditions = 6;
		obj.weather = 'Raining';
    }
	if (metarObservation.indexOf("SN") != -1 && metarObservation.indexOf("SNE") == -1){
		obj.skyconditions = 7;
		obj.weather = 'Snowing';
	}
	if (metarObservation.indexOf("LTG") != -1){
		obj.skyconditions = 8;
		obj.weather = 'Thunderstorms';
	}
	skyconditions.push(obj);
	
// now get forecasts
	if (forecastObj.length > 0){
	   for(var x = 0; x<49;x+=24){
			var obj = {
					skyconditions: 1,
					weather: 'Clear'
			}
		   if (forecastObj[x].weather_code.value == 'clear'){
			   obj.skyconditions = 1;
			   obj.weather = 'Clear';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'mostly_clear'){
			   obj.skyconditions = 2;
			   obj.weather = 'Mostly Clear';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'partly_cloudy'){
			   obj.skyconditions = 3;
			   obj.weather = 'Partly Cloudy';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'mostly_cloudy'){
			   obj.skyconditions = 4;
			   obj.weather = 'Mostly Cloudy';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'cloudy'){
			   obj.skyconditions = 5;
 			   obj.weather = 'Overcast';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'fog_light'){
			   obj.skyconditions = 5;
 			   obj.weather = 'Light Fog';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'fog'){
			   obj.skyconditions = 5;
 			   obj.weather = 'Dense Fog';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'rain_light'){
			   obj.skyconditions = 9;
			   obj.weather = 'Light Rain';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'drizzle'){
			   obj.skyconditions = 9;
			   obj.weather = 'Drizzle';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'rain'){
			   obj.skyconditions = 6;
			   obj.weather = 'Rain';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'rain_heavy'){
			   obj.skyconditions = 6;
			   obj.weather = 'Heavy Rain';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'tstorm'){
			   obj.skyconditions = 8;
			   obj.weather = 'Thunderstorms';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'flurries'){
			   obj.skyconditions = 10;
			   obj.weather = 'Snow Flurries';
		   }
		   else
			   if (forecastObj[x].weather_code.value == 'snow_light'){
				   obj.skyconditions = 10;
				   obj.weather = 'Light Snow';
			   }
		   else
		   if (forecastObj[x].weather_code.value == 'snow'){
			   obj.skyconditions = 7;
   			   obj.weather = 'Snow';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'snow_heavy'){
			   obj.skyconditions = 7;
			   obj.weather = 'Heavy Snow';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'ice_pellets_light'){
			   obj.skyconditions = 11;
			   obj.weather = 'Light Icing';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'ice_pellets'){
			   obj.skyconditions = 11;
			   obj.weather = 'Ice Pellets';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'ice_pellets_heavy'){
			   obj.skyconditions = 11;
			   obj.weather = 'Heavy Icing';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'freezing_drizzle'){
			   obj.skyconditions = 11;
			   obj.weather = 'Freezing drizzle';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'freezing_rain_light'){
			   obj.skyconditions = 11;
			   obj.weather = 'Light Freezing Rain';
		   }
		   else
		   if (forecastObj[x].weather_code.value == 'freezing_rain'){
			   obj.skyconditions = 11;
			   obj.weather = 'Freezing Rain';
		   }
		   else
		   {
			   obj.skyconditions = 11;
			   obj.weather = 'Heavy Freezing Rain';
		   }
		   skyconditions.push(obj);
	   }
	}
	else{
		var obj = {
				skyconditions: 1,
				weather: 'Unavailable'
		}
		for(var x=1;x<4;x++)
		    skyconditions.push(obj)
	}
	return skyconditions
}
function getLunarDetails(){
	var now = new Date();
	var moonIllumination = Math.floor(suncalc.getMoonIllumination(now).fraction * 100);
	var newVector = 0;
	var start = new Date(app.locals.moment(new Date()).format('MMMM DD,YYYY 00:00:00'));
	var daystart = new Date(start)
	var dayend = new Date(start)
	for (var x=1; x < 31; x++){
		daystart = new Date(start)
        daystart.setDate(daystart.getDate()+x)
        dayend.setDate(daystart.getDate()+1)
    	var dayStartPhase = suncalc.getMoonIllumination(daystart).phase
    	var dayEndPhase = suncalc.getMoonIllumination(dayend).phase
    	if (dayStartPhase > dayEndPhase){
    		newVector = 0;
    		break;
    	}
    	else
        if (dayStartPhase <= .25 && dayEndPhase > .25){
        	newVector = 2;
        	break;
        }
        else
        if (dayStartPhase <= .5 && dayEndPhase > .5){
        	newVector = 4;
        	break;
        }
        else
        if (dayStartPhase <= .75 && dayEndPhase > .75){
        	newVector = 6;
        	break;
        }
	}
	 var moonPhase = 'New Moon'
     if (newVector == 2)
        moonPhase = 'First Quarter';
     else 
     if (newVector == 4)
        moonPhase = 'Full Moon';
     else 
     if (newVector == 6)
        moonPhase = 'Third Quarter';
	return {illumination: moonIllumination,nextPhaseDate: app.locals.moment(daystart).format('ddd MMM Do'), nextPhaseType: moonPhase}
}
function makeMoonPhaseVector(){
	var daystart = new Date(app.locals.moment(new Date()).format('MMMM DD,YYYY 00:00:00'));
	var dayend = new Date(daystart)
	dayend.setDate(daystart.getDate()+1)
	var dayStartPhase = suncalc.getMoonIllumination(daystart).phase
	var dayEndPhase = suncalc.getMoonIllumination(dayend).phase
	if (dayStartPhase > dayEndPhase)
		return 0;
    if (dayStartPhase < .25 && dayEndPhase > .25)
    	return 2;
    if (dayStartPhase < .5 && dayEndPhase > .5)
    	return 4;
    if (dayStartPhase < .75 && dayEndPhase > .75)
    	return 6;
    if (dayStartPhase < .25)
    	return 1;
    if (dayStartPhase < .5)
    	return 3;
    if (dayStartPhase < .75)
    	return 5;
    return 7;
    	
}

function makeCompassVector(direction){
	var left=top=rotation=0;
	var heading='';
	if (direction == 0)
       return {heading: heading,left: left,top: top,rotation: rotation};
	direction = 22.5 * Math.round(direction / 22.5)
    switch(true){
    case (direction == 0):
	       heading='N';left=226;top=103;rotation=0;
           break;
       case (direction == 22.5):
    	   heading='NNE';left=276;top=113;rotation=22.5;
    	   break;
       case (direction == 45):
    	   heading='NE';left=318;top=142;rotation=45;
    	   break;
       case (direction == 67.5):
    	   heading='ENE';left=346;top=185;rotation=67.5;
    	   break;
       case (direction == 90):
    	   heading='E';left=355;top=235;rotation=90;
    	   break;
       case (direction == 112.5):
    	   heading='ESE';left=345;top=283;rotation=112.50;
    	   break;
       case (direction == 135):
    	   heading='SE';left=316;top=325;rotation=135;
    	   break;
       case (direction == 157.5):
    	   heading='SSE';left=273;top=353;rotation=157.5;
    	   break;
       case (direction == 180):
    	   heading='S';left=224;top=362;rotation=180;
    	   break;
       case (direction == 202.5):
    	   heading='SSW';left=174;top=351;rotation=202.5;
    	   break;
       case (direction == 225):
    	   heading='SW';left=132;top=323;rotation=225;
    	   break;
       case (direction == 247.5):
    	   heading='WSW';left=104;top=280;rotation=247.5;
    	   break;
       case (direction == 270):
    	   heading='W';left=95;top=231;rotation=270;
    	   break;
       case (direction == 292.5):
    	   heading='WNW';left=105;top=183;rotation=292.5;
    	   break;
       case (direction == 315):
    	   heading='NW';left=133;top=141;rotation=315;
    	   break;
       case (direction == 337.5):
    	   heading='NNW';left=176;top=112;rotation=337.5;
    	   break;
       case (direction == 360):
 	       heading='N';left=226;top=103;rotation=0;
 	       break;
       default:
           break;
    }
    return {heading: heading,left: left,top: top,rotation: rotation};
}

//process...
app.get('/', function (req, res) {
	var directionObj = []
	directionObj[0] = makeCompassVector(direction)
	directionObj[1] = makeCompassVector(lastDirection);
	directionObj[2] = makeCompassVector(lastDirection1);
	directionObj[3] = makeCompassVector(lastDirection2);
	directionObj[4] = makeCompassVector(lastDirection3);
	
    res.render('defaultresponse',{loadstylesheet: true,observationUnits: observationUnits,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime,directionObj: directionObj,rainStormStart: rainStormStart,rainStormAmt: rainStormAmt,rainStormRate: rainStormRate,outTempTrend: outTempTrend,speed:speed,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/liveconditions', function (req, res) {
    res.render('liveconditions',{loadstylesheet: false,observationUnits: observationUnits,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),day: daytime,rainStormStart: rainStormStart,rainStormAmt: rainStormAmt,rainStormRate: rainStormRate,outTempTrend: outTempTrend,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/tileconditions', function (req, res) {
    res.render('tileconditions',{loadstylesheet: false,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/refreshsuntile', function (req, res) {
    res.render('refreshsuntile',{loadstylesheet: false,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/livewind', function (req, res) {
    res.locals.err = false;
	var directionObj = []
	directionObj[0] = makeCompassVector(direction)
	directionObj[1] = makeCompassVector(lastDirection);
	directionObj[2] = makeCompassVector(lastDirection1);
	directionObj[3] = makeCompassVector(lastDirection2);
	directionObj[4] = makeCompassVector(lastDirection3);
    res.render('livewind',{loadstylesheet: false,observationUnits: observationUnits,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,rainStormRate: rainStormRate,skyconditions: makeSkyConditionsVector(),day: daytime,directionObj: directionObj,speed:speed})
})
app.get('/radar', function (req, res) {
	res.render('radarresponse',{weatherSiteVersion: weatherSiteVersion,loadstylesheet: true,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath})
})
app.get('/radarrefresh', function (req, res) {
    res.locals.err = false;
	res.render('radarrefresh',{weatherSiteVersion: weatherSiteVersion,loadstylesheet: false,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath})
})
app.get('/charts', function (req, res) {
    var xData = [" "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "];
    var hrStart = app.locals.moment(oDate[0]).format('HH')
    for (var x=0;x<oDate.length;x++){
    	if (app.locals.moment(oDate[x]).format('HH') != hrStart){
    		hrStart = app.locals.moment(oDate[x]).format('HH');
   			xData[x] = app.locals.moment(oDate[x]).format('ha');
    	}
    }
    xData = xData.slice(0,oDate.length)
    var fontColor = "#fff"
    if (daytime  && makeSkyConditionsVector()[0].skyconditions < 5)
    	fontColor = "#000"

    var lineOptions = clone(linechart);
    lineOptions.legend.data = ["Outside Temp","Dew Point"]
    lineOptions.legend.textStyle.color = fontColor
    lineOptions.xAxis.data = xData;
    lineOptions.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions.series[0].name = "Outside Temp"
    lineOptions.series[0].data = oTemp
    lineOptions.series[1].name = "Dew Point"
    lineOptions.series[1].data = oDewpt

    var lineOptions2 = clone(linechart);
    lineOptions.yAxis.axisLabel.formatter = "{value} \u00b0F"
    lineOptions2.yAxis.axisLabel.formatter = "{value} mph"
    lineOptions2.legend.data = ["Wind Speed","Wind Gust","Wind Direction"]
    lineOptions2.legend.textStyle.color = fontColor
    lineOptions2.xAxis.data = xData;
    lineOptions2.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.series[0].name = "Wind Speed"
    lineOptions2.series[0].data = oWindspd
    lineOptions2.series[1].name = "Wind Gust"
    lineOptions2.series[1].data = oWindgust
    lineOptions2.series[2].name = "Wind Direction"
    lineOptions2.series[2].data = []

    var lineOptions3 = clone(linechart);
    lineOptions3.yAxis.axisLabel.formatter = "{value}\u201d"
    lineOptions3.legend.data = ["Barometer"]
    lineOptions3.legend.textStyle.color = fontColor
    lineOptions3.xAxis.data = xData;
    lineOptions3.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions3.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions3.series[0].name = "Barometer"
    lineOptions3.series[0].data = oBarometer
    lineOptions3.series[1].name = ""
    lineOptions3.series[1].data = []
    
    if (observationUnits.metricTemp)
        lineOptions.yAxis.axisLabel.formatter = "{value} \u00b0C"
    if (observationUnits.metricSpeed)
        lineOptions2.yAxis.axisLabel.formatter = "{value} km/h"
            if (observationUnits.metricPressure){
                lineOptions3.yAxis.axisLabel.formatter = "{value} mb"
                lineOptions.grid.left = "8.2%"
                lineOptions2.grid.left = "8.2%"
                lineOptions3.grid.left = "8.2%"
            }


    var avgDir = 0
    var dirArray = []
    for(var x=0;x<= xData.length; x++){
    	if (x %6 == 0 && x > 0){
    		avgDir = Math.floor(avgDir / 6)
    		avgDir = 22.5 * Math.round(avgDir / 22.5)
       		if (avgDir == 22.5)
       			dirArray.push('nne')
    		else
       		if (avgDir == 45)
       			dirArray.push('ne')
    		else
       		if (avgDir == 67.5)
       			dirArray.push('ene')
    		else
       		if (avgDir == 90)
       			dirArray.push('e')
    		else
       		if (avgDir == 112.5)
       			dirArray.push('ese')
    		else
       		if (avgDir == 135.5)
       			dirArray.push('se')
    		else
       		if (avgDir == 157.5)
       			dirArray.push('sse')
    		else
       		if (avgDir == 180)
       			dirArray.push('s')
    		else
       		if (avgDir == 202.5)
       			dirArray.push('ssw')
    		else
       		if (avgDir == 225)
       			dirArray.push('sw')
    		else
       		if (avgDir == 247.5)
       			dirArray.push('wsw')
    		else
       		if (avgDir == 270)
       			dirArray.push('w')
    		else
       		if (avgDir == 292.5)
       			dirArray.push('wnw')
    		else
       		if (avgDir == 315)
       			dirArray.push('nw')
    		else
       		if (avgDir == 337.5)
       			dirArray.push('nnw')
    		else
       			dirArray.push('n')
       		avgDir = 0;
    	}
    	avgDir += oWinddir[x];
    }

    var chartVectors = [];
	var leftPosition = 80;
	var leftPositionIncrement = Math.floor((920 - leftPosition) / dirArray.length)
	for (x=0; x < dirArray.length; x++){
		var positionObj = {}
		positionObj.direction = dirArray[x];
		positionObj.left = leftPosition;
		chartVectors.push(positionObj)
		leftPosition+= leftPositionIncrement
	}
    

    res.render('charts',{chartvectors: chartVectors,loadstylesheet: true,data: JSON.stringify(lineOptions),data2: JSON.stringify(lineOptions2),data3: JSON.stringify(lineOptions3),skyconditions: makeSkyConditionsVector(),zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,rainStormRate: rainStormRate,moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/chartrefresh', function (req, res) {
    res.locals.err = false;
    var xData = [" "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "];
    var hrStart = app.locals.moment(oDate[0]).format('HH')
    for (var x=0;x<oDate.length;x++){
    	if (app.locals.moment(oDate[x]).format('HH') != hrStart){
    		hrStart = app.locals.moment(oDate[x]).format('HH');
   			xData[x] = app.locals.moment(oDate[x]).format('ha');
    	}
    }
    xData = xData.slice(0,oDate.length)
    var fontColor = "#fff"
    if (daytime  && makeSkyConditionsVector()[0].skyconditions < 5)
    	fontColor = "#000"

    var lineOptions = clone(linechart);
    lineOptions.yAxis.axisLabel.formatter = "{value} \u00b0F"
    lineOptions.legend.data = ["Outside Temp","Dew Point"]
    lineOptions.legend.textStyle.color = fontColor
    lineOptions.xAxis.data = xData;
    lineOptions.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions.series[0].name = "Outside Temp"
    lineOptions.series[0].data = oTemp
    lineOptions.series[1].name = "Dew Point"
    lineOptions.series[1].data = oDewpt

    var lineOptions2 = clone(linechart);
    lineOptions2.yAxis.axisLabel.formatter = "{value} mph"
    lineOptions2.legend.data = ["Wind Speed","Wind Gust","Wind Direction"]
    lineOptions2.legend.textStyle.color = fontColor
    lineOptions2.xAxis.data = xData;
    lineOptions2.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.series[0].name = "Wind Speed"
    lineOptions2.series[0].data = oWindspd
    lineOptions2.series[1].name = "Wind Gust"
    lineOptions2.series[1].data = oWindgust
    lineOptions2.series[2].name = "Wind Direction"
    lineOptions2.series[2].data = []

    var lineOptions3 = clone(linechart);
    lineOptions3.yAxis.axisLabel.formatter = "{value}\u201d"
    lineOptions3.legend.data = ["Barometer"]
    lineOptions3.legend.textStyle.color = fontColor
    lineOptions3.xAxis.data = xData;
    lineOptions3.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions3.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions3.series[0].name = "Barometer"
    lineOptions3.series[0].data = oBarometer
    lineOptions3.series[1].name = ""
    lineOptions3.series[1].data = []

    if (observationUnits.metricTemp)
        lineOptions.yAxis.axisLabel.formatter = "{value} \u00b0C"
    if (observationUnits.metricSpeed)
        lineOptions2.yAxis.axisLabel.formatter = "{value} km/h"
    if (observationUnits.metricPressure){
        lineOptions3.yAxis.axisLabel.formatter = "{value} mb"
        lineOptions.grid.left = "8.2%"
        lineOptions2.grid.left = "8.2%"
        lineOptions3.grid.left = "8.2%"
    }

    var avgDir = 0
    var dirArray = []
    for(var x=0;x<= xData.length; x++){
    	if (x %6 == 0 && x > 0){
    		avgDir = Math.floor(avgDir / 6)
    		avgDir = 22.5 * Math.round(avgDir / 22.5)
       		if (avgDir == 22.5)
       			dirArray.push('nne')
    		else
       		if (avgDir == 45)
       			dirArray.push('ne')
    		else
       		if (avgDir == 67.5)
       			dirArray.push('ene')
    		else
       		if (avgDir == 90)
       			dirArray.push('e')
    		else
       		if (avgDir == 112.5)
       			dirArray.push('ese')
    		else
       		if (avgDir == 135.5)
       			dirArray.push('se')
    		else
       		if (avgDir == 157.5)
       			dirArray.push('sse')
    		else
       		if (avgDir == 180)
       			dirArray.push('s')
    		else
       		if (avgDir == 202.5)
       			dirArray.push('ssw')
    		else
       		if (avgDir == 225)
       			dirArray.push('sw')
    		else
       		if (avgDir == 247.5)
       			dirArray.push('wsw')
    		else
       		if (avgDir == 270)
       			dirArray.push('w')
    		else
       		if (avgDir == 292.5)
       			dirArray.push('wnw')
    		else
       		if (avgDir == 315)
       			dirArray.push('nw')
    		else
       		if (avgDir == 337.5)
       			dirArray.push('nnw')
    		else
       			dirArray.push('n')
       		avgDir = 0;
    	}
    	avgDir += oWinddir[x];
    }
    var chartVectors = [];
	var leftPosition = 80;
	var leftPositionIncrement = Math.floor((920 - leftPosition) / dirArray.length)
	for (x=0; x < dirArray.length; x++){
		var positionObj = {}
		positionObj.direction = dirArray[x];
		positionObj.left = leftPosition;
		chartVectors.push(positionObj)
		leftPosition+= leftPositionIncrement
	}

    res.render('chartrefresh',{chartvectors: chartVectors,loadstylesheet: false,data: JSON.stringify(lineOptions),data2: JSON.stringify(lineOptions2),data3: JSON.stringify(lineOptions3),skyconditions: makeSkyConditionsVector(),zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,rainStormRate: rainStormRate,moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/testpattern', function (req, res) {
    res.locals.err = false;
	var directionObj = []
	var y = 0
	for (var x = 1;x<360;x+=22.5){
	    directionObj[y++] = makeCompassVector(x)
	}
	console.log(oTemp.length)
	for (var x=0;x<oTemp.length;x++)
		console.log(oTemp[x]);
    res.render('testpattern',{observationUnits: observationUnits,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,rainStormRate: rainStormRate,skyconditions: makeSkyConditionsVector(),day: daytime,moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,directionObj: directionObj})
})

//Find my WLL if necessary 
if (myWLLIp.length == 0)
    findWLL();
else{
    console.log("Attached to WLL at "+myWLLIp)
	startWLLqueries();
}

//UDP Server

server.on('listening',function(){
  var address = server.address();
  var port = address.port;
  var family = address.family;
  var ipaddr = address.address;
  console.log('UDP Server is listening at port ' + port);
});
server.on('message',function(msg,info){
	  //console.log(msg.toString());
	  if (info.address != myWLLIp) // drop foreign broadcasts
		  return
	  var obj = JSON.parse(msg);
	  direction=obj.conditions[0].wind_dir_last;
	  if (direction != lastDirection){
	     lastDirection3 = lastDirection2;
	     lastDirection2 = lastDirection1;
	     lastDirection1 = lastDirection;
	     lastDirection = direction;
      }
	  speed=Math.round(obj.conditions[0].wind_speed_last);
	  if (observationUnits.metricSpeed)
		  speed = Math.round(speed * 1.60934)
	  gustDirection=obj.conditions[0].wind_dir_at_hi_speed_last_10_min;
	  gustSpeed=Math.round(obj.conditions[0].wind_speed_hi_last_10_min);
	  if (observationUnits.metricSpeed)
		  gustSpeed = Math.round(gustSpeed * 1.60934)
	  //rainStormStart='1603243501';
	  rainStormStart=obj.conditions[0].rain_storm_start_at
	  if (observationUnits.metricRain){
		  rainStormAmt=(obj.conditions[0].rain_storm *.2).toFixed(2);
		  rainStormRate=obj.conditions[0].rain_rate_last *.2;
		  
	  }
	  else{
	      rainStormAmt=(obj.conditions[0].rain_storm *.01).toFixed(2);
	      rainStormRate=obj.conditions[0].rain_rate_last *.01
	  }
	  if (rainStormStart == null){
		  rainStormStart = ''
	  }
	  else{
		  rainStormStart = app.locals.moment.unix(rainStormStart).format('MMM D, h:mm a')
	  }
});


// Get initial METAR observation
if (myMetarFtpSite.length > 0){
   var Observation = ""; // Will store the contents of the file
   try{
   console.log('Retrieving METAR observation');
   ftp.get(myMetarFilePath, (err, socket) => {
     if (err) {
       return;
     }

     socket.on("data", d => {
       Observation += d.toString();
     });

     socket.on("close", err => {
       if (err) {
         console.error("Metar Observation retrieval error.");
         return
       }
       metarObservation = Observation;
       console.log("METAR observation retrieved");
     });

     socket.resume();
   });
   }
   catch(err){
       console.log('Caught Metar Observation error')
   }
}

// Get initial Climacell forecast
if (myClimacellApiKey.length > 0){
   dt = new Date()
   sdt = new Date()
   edt = new Date()
   sdt.setDate(dt.getDate()+1)
   edt.setDate(dt.getDate()+3)
   sdt = app.locals.moment(sdt).format('YYYY-MM-DD')+'T18:00:00Z';
   edt = app.locals.moment(edt).format('YYYY-MM-DD')+'T18:00:00Z';
   var ccreq = "https://api.climacell.co/v3/weather/forecast/hourly?unit_system=si&lat="+myLatitude+"&lon="+myLongitude+"&start_time="+sdt+"&end_time="+edt+"&fields=weather_code&apikey="+myClimacellApiKey
   //console.log(ccreq)    
   var req0 = https.get(ccreq,function(resp){
	   var ccdata = '';
	   resp.on('data',function(chunk){
		   ccdata+=chunk
	   })
	   resp.on('end',function(){
		   var forecastObjTmp = JSON.parse(ccdata);
		   if (forecastObjTmp.length > 0)
			   forecastObj = forecastObjTmp;
		   req0.end();
	   })
   }).on('error',(err) =>{
	      console.log("Forecast initial request failure")
	      req0.end();
   })
}


// request the current forecast from ClimaCell every 30 minutes
if (myClimacellApiKey.length > 0){
   setInterval(function(){
	   dt = new Date()
	   sdt = new Date()
	   edt = new Date()
	   sdt.setDate(dt.getDate()+1)
	   edt.setDate(dt.getDate()+3)
	   sdt = app.locals.moment(sdt).format('YYYY-MM-DD')+'T18:00:00Z';
	   edt = app.locals.moment(edt).format('YYYY-MM-DD')+'T18:00:00Z';
	   var ccreq = "https://api.climacell.co/v3/weather/forecast/hourly?unit_system=si&lat="+myLatitude+"&lon="+myLongitude+"&start_time="+sdt+"&end_time="+edt+"&fields=weather_code&apikey="+myClimacellApiKey
	   var req0 = https.get(ccreq,function(resp){
		   var ccdata = '';
		   resp.on('data',function(chunk){
			   ccdata+=chunk
		   })
		   resp.on('end',function(){
			   var forecastObjTmp = JSON.parse(ccdata);
			   if (forecastObjTmp.length > 0)
				   forecastObj = forecastObjTmp;
			   req0.end();
		   })
	   }).on('error',(err) =>{
		      console.log("ClimaCell Forecast request failure")
		      req0.end();
	   })

	
   },30*60*1000) //retrieve new forecast every 30 minutes
}


// test code: make it night in 30 seconds
/*
setTimeout(function(){
	daytime = 0
}, 30*1000)
*/

// periodically determine day/night and moon phase

setInterval(function(){
	var now = new Date();
	var obj = suncalc.getTimes(now,myLatitude,myLongitude)
	if ((now > obj.dusk && now > obj.dawn) || (now < obj.dawn && now < obj.dusk))
		daytime = 0;
	else
		daytime = 1;
	sunrise = obj.sunrise;
	sunset = obj.sunset;
	moonsize = makeMoonPhaseVector();
}, 10*60*1000); 

//Start up  Web server


	http.createServer(app).listen(app.get('port'), function(){
		  console.log("\nWeathersite is online at "+myUrl+'\n');
		  try{
		      spawn('python3',['/stats.py'])
		  }
		  catch(err){
			  // toss any errors because this only works on the Pi build with display hat
		  }
		});



