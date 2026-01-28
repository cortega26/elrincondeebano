$ErrorActionPreference = "Stop"

$targets = @("admin")

python -m pip_audit -r admin/product_manager/requirements.txt
python -m bandit -r $targets
python -m mypy
python -m pytest admin -n auto --cov=admin/product_manager --cov-report=term-missing
