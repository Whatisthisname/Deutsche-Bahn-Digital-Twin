// This is the decision tree trained in python. 
// The input is a vector of numbers like 
// [station_id, last_delay, day_of_week, hour_of_day, minute_of_hour, etc] 
// and the output is the predicted delay in minutes.
export declare function score(input: number[]): number;

