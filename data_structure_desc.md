Before refactor:



One event looks like this:

$\to \circ \to$
```py
journey ID : int
station name : str
station number on journey : int
expected arrival : datetime
arrival : datetime
expected departure : datetime
departure : datetime
canceled : bool
final_destination : str
```
To split this dataset, we take consecutive events like this:

$\to \circ \to\;\;\;\;\;$ $\to \circ \to$

And split it into three types of events with this schema
```py
event : "ARRIVAL" | "DEPARTURE" | "CANCELLATION"
from_station : str
to_station : str
station number on journey : int
timestamp : datetime
expected_next_event : Optional[datetime]
final_destination : str
```

This gives (for a non-cancelled journey) this type of event:

$\circ \to$, which is a `DEPARTURE` event, and $\to \circ$, which is an `ARRIVAL` event.

For `ARRIVAL`, `timestamp` holds the time of actual arrival, and `expected_next_event` is the expected time of departure from the same station. 
For `DEPARTURE`, `timestamp` holds the time of actual departure, and `expected_next_event` is the expected time of arrival to the next station. 

If an event is of type `ARRIVAL` or `DEPARTURE`, it will not be cancelled. When journeys get cancelled, they will have a final event of type `CANCELLATION`, which replaces the final arrival event. This makes it easier to track if they are cancelled or not.