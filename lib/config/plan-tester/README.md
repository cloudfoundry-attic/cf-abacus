abacus-plan-tester
===

```bash
# Clone Abacus
git clone https://github.com/cloudfoundry-incubator/cf-abacus.git

# Build Abacus
cd cf-abacus
npm run build

# Test your plan
cd lib/config/plan-tester
export TEST_PLAN=path_to_your_plan
npm test
```