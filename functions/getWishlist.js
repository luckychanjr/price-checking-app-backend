import AWS from "aws-sdk";

const dynamo = new AWS.DynamoDB.DocumentClient();

export const handler = async () => {
  const result = await dynamo.scan({
    TableName: "WishlistItems"
  }).promise();

  return {
    statusCode: 200,
    body: JSON.stringify(result.Items)
  };
};