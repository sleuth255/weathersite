
# weathersite

Website console for Davis 6100 Weatherlink Live.  Implemented as a nodeJS application that can run on a Raspberry Pi.  Display optimized for an 8" tablet.  Tested with Android tablets using the Fully Kiosk browser app. 




## Installation

Full installation instructions can be found in the document "Weathersite Installation guide.pdf"

## Execution

node.js must be installed.  Then run as follows:

node /weathersite/app.js


## Usage

### Access the site on port 5000:

http://localhost:5000
or
http://[ip address of site]:5000

You will be taken to the default conditions page


## Known issues/Todos
* Intermittent HTTP socket hangup error during WLL current conditions retrieval.
 

## Changelog:

### v1.7
* Upgrade to ClimaCell api v4.0.  ***Note***: a new v4.0 api key is required.  Re-register for a free v4.0 developer key at https://climacell.co/weather-api

### v1.6
* dynamically parse for sensors in WLL responses

### v1.5
* add Settings Page

### v1.4
* duplicate last chart entry if current conditions request fails
* find WLL automatically if myWLLIp variable isn't filled in.

### v1.3
* add wind direction to charts

### v1.2
* Fix issue: add another decimal point of accuracy to metric pressure (mb)

### v1.1
* Activate moon tile with disk illumination percent, next phase date, and next phase type

### v1.0
* Initial release by Sleuth255
