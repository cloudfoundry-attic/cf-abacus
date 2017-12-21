abacus-plan-tester
===

Prerequisites:
* Node.js 8
* npm 4

```bash
# Clone Abacus
git clone https://github.com/cloudfoundry-incubator/cf-abacus.git

# Install npm 4
npm install -g npm@4

# Build Abacus
cd cf-abacus
npm run provision

# Test your plan
cd lib/config/plan-tester
export TEST_PLAN=path_to_your_plan
npm test
```
