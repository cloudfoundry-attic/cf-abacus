Abacus Design Notes
===

### Document ids used to index usage docs 

Document ids are composed of a key and a time, encoded using the following syntax:
```
/k/:key/t/:time
```
or
```
/t/:time/k/:key
```

The key and the time can contain multiple segments, for example the key can include an organization id, a resource instance id, and a plan id  as follows:
```
/k/:organization_id/:resource_instance_id/:plan_id/t/...
```

#### Collector

_Input_:
```
/t/:seqid/k/:provider
```

_Output_:
```
/k/:organization_id/:resource_instance_id/:consumer_id/:plan_id/t/:start/:end/:seqid
```

#### Meter

_Input_:
```
/t/:seqid/k/:organization_id/:resource_instance_id/:consumer_id/:plan_id
```

_Output_:
```
/k/:organization_id/:resource_instance_id/:consumer_id/:plan_id/t/:end/:start
```

#### Accumulator

_Input_:
```
/t/:seqid/k/:organization_id/:resource_instance_id/:consumer_id/:plan_id
```

_Output_:
```
/k/:organization_id/:resource_instance_id/:consumer_id/:plan_id/t/:end/:start
```

#### Aggregator

_Input_:
```
/t/:seqid/k/:organization_id
```

_Output_:
```
/k/:organization_id/t/:seqid
```

