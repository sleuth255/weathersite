
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
* no issues currently
* todo: add settings page
* todo: add wind direction to charts
 

## Changelog:

### v1.2
* Fix issue: add another decimal point of accuracy to metric pressure (mb)

### v1.1
* Activate moon tile with disk illumination percent, next phase date, and next phase type

### v1.0
* Initial release by Sleuth255
