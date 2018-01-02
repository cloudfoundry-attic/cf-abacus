abacus-plan-tester
===

Prerequisites:
* Node.js 8
* npm 4

```bash
# Clone Abacus
git clone https://github.com/cloudfoundry-incubator/cf-abacus.git

# Install dependencies
cd cf-abacus/lib/config/plan-tester
npm install

# Test your plan
export TEST_PLAN=path_to_your_plan
npm test
```
