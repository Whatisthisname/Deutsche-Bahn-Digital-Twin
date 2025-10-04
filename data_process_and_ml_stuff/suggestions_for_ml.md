# ML suggestions

# Predicting delay per train

A journey can be described as the following sequence:

$(\text{station\_id}, \text{delay to arrival})_i$ for $i \in \{1, \#\text{known stops}\}$. Given this sequence and the following $\text{station\_id}$, we can try to predict the next delay to arrival. Because we have an underlying graph structure, we can also add station-level features to this sequence using a graph-neural-network.


### Even simpler:

Given an event $a$ and the following event $b$, we can calculate the associated delay at event $b$ as
$$delay(b) := b.time - a.expected\_next\_event\_time$$



# Predicting delay on a region-level

We partition the graph into connected clusters and aggregate their delay metrics, and then try to predict the future delay region pattern. This can be done with traditional ML


# Features:

Temporal / seasonal


