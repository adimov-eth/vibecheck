#!/bin/bash

# Run tests with coverage
echo "Running tests with coverage..."

# Clean up old coverage files
rm -rf coverage
mkdir -p coverage

# Run tests with coverage
bun test --coverage --coverage-reporter=text --coverage-reporter=lcov

# Check if lcov.info was generated
if [ -f "coverage/lcov.info" ]; then
  echo ""
  echo "✅ Coverage report generated successfully!"
  echo "📊 Text report shown above"
  echo "📄 LCOV report saved to: coverage/lcov.info"
  
  # Show coverage summary
  echo ""
  echo "Coverage Summary:"
  total_lines=$(grep -E "^DA:" coverage/lcov.info | wc -l | tr -d ' ')
  covered_lines=$(grep -E "^DA:[0-9]+,[1-9]" coverage/lcov.info | wc -l | tr -d ' ')
  
  if [ "$total_lines" -gt 0 ]; then
    coverage_percent=$((covered_lines * 100 / total_lines))
    echo "Lines covered: $covered_lines / $total_lines ($coverage_percent%)"
  fi
else
  echo "❌ Coverage report generation failed"
  exit 1
fi