# The History Writer's book job (Phase ED.11a): history/tools/book_job.py as a Cloud Run Job.
# Standard library only: no pip install. See README.md next to this file.
#
# Build from the mchatai-source root, since the image needs history/ and llm-catalog/:
#   docker build --platform linux/amd64 -f history/jobs/cloud/Dockerfile -t book-job .
# BuildKit reads Dockerfile.dockerignore beside this file, so only those two paths enter the image.
#
# Run (one execution = one `run`; the project is a mounted GCS prefix, README.md "Where the project lives"):
#   book-job run /mnt/books/users/<uid>/<slug> --plan /mnt/books/users/<uid>/<slug>/cloud/steps.json
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
# cloud_models.py finds request-shapes.json at <history>/../llm-catalog/, so the two keep this layout.
COPY history/ /app/history/
COPY llm-catalog/request-shapes.json /app/llm-catalog/request-shapes.json

# The job writes only into the project folder it is given; /app stays read-only to it.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin book
USER 10001

ENTRYPOINT ["python3", "/app/history/tools/book_job.py"]
