# Backup and Restore

To create a backup of the site from the project root:

```
tar -czf elrincondeebano-backup-YYYYMMDD.tar.gz .
```

Store the resulting `*.tar.gz` in an off-site location, such as `/tmp/offsite/`.

To restore the backup into a directory of your choice:

```
tar -xzf elrincondeebano-backup-YYYYMMDD.tar.gz -C <restore_dir>
```

Replace `YYYYMMDD` with the date the backup was created.
