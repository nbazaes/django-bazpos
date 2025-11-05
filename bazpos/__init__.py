# Register PyMySQL as MySQLdb replacement so Django can use 'django.db.backends.mysql'
# This is a lightweight shim; ensure PyMySQL is installed in the virtualenv.
try:
    import pymysql
    pymysql.install_as_MySQLdb()
except Exception:
    # If PyMySQL is not installed yet, importing will fail at runtime when Django starts.
    # We silently ignore here so the import error will point to installing PyMySQL.
    pass
