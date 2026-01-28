$ErrorActionPreference = "Stop"

$targets = @("admin", "scripts")

python -m ruff check $targets --fix
python -m ruff format $targets
python -m pylint $targets
