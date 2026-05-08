FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python manage.py collectstatic --no-input


CMD ["gunicorn", "--bind", "0.0.0.0:8000", "bazpos.wsgi:application"]
