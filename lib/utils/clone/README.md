abacus-clone
===

Creates a deep copy of an array or object such that modifying
any level of the copy will not change anything on the original

The interceptor function is called on every property of the object passed
including the object itself. It must return a value. If no interceptor
function is passed, a default interceptor that results in a deep clone
is used.

Example
---

interceptor(value, key)
```javascript
(value, key) => {
  if(key === 'money')
    return value * 2;
  return value;
}
```
