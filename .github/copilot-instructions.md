## Python Virtual Environment Rules

This project uses a Python virtual environment located at `venv/`.

**Mandatory rules:**

- Always use the project's virtual environment to execute Python commands.
- Never use the global or system Python interpreter.
- Always install Python dependencies inside the virtual environment.
- Always use the virtual environment when running scripts, tests, migrations, or development tools.
- Before running Python commands, check whether `venv/` exists.
- If the virtual environment does not exist, create it using `python -mvenv venv`.
- Prefer calling the virtual environment executables directly instead of relying on shell activation.

**Examples:**

- Run Python: `venv/bin/python script.py`
- Install packages: `venv/bin/python -m pip install package`
- Run tests: `venv/bin/python -m pytest`
- Run a module: `venv/bin/python -m module_name`

Never execute `pip install`, `python`, or `pytest` using the system environment when the project's virtual environment is available.
