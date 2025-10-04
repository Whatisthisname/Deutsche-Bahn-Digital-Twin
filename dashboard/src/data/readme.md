# `ice.csv`
`ice.csv` is the original data from the github. It contains the original event data which was "cheating" because it had future information in it.

# `ice_journey_events.csv`
`ice_journey_events.csv` is the converted event dataset, converted using `data_process_and_ml_stuff/convert_to_journey_events.py`. In this one, the events are split into ARRIVAL, DEPARTURE or CANCELLATION events.


# `graph_structure.json`
`graph_structure.json` holds the railroad network.
It has a field `stations` which is a dict from station ID to a list of properties of the station. The station ID can be found in the 
```text
"stationNameToId": {
    "München-Pasing": "-1351464502288837391",
    "Berlin Hauptbahnhof": "8947651376921883663",
    ...
```
mapping.
Each element in `stations` is the following object:
```text
"-1351464502288837391": {
      "name": "München-Pasing",
      "lat": 48.149852,
      "lon": 11.461872,
      "degree": 2,
      "closenessCentrality": 0.24585635359116023
    },
```
We can read the original station name as a string, the coordinates, the degree (how many neighboring stations are there) and the `closenessCentrality` which is a metric of how "central" the station is. This is useful for ML.

Finally, `edges` looks like this:
```text
"edges": [
    [
      "-1351464502288837391", // ID of the station at one end
      "8074158413791284380",  // ID of the station at other end
      7.236521407345647,      // distance (km) between stations
      4216                    // amount of trains that have used 
                              //   this connection historically
                              //   (maybe useful for ML)
    ],
    ...
```
# `alternative_station_name_to_station_name.json`

The file `dashboard/src/data/alternative_station_name_to_station_name.json` does what it says it does. It is used in `/convert_to_journey_events.py` to give stations unique names.